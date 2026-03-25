import os
import boto3
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from functools import wraps
from dotenv import load_dotenv

# 1. Load local .env file if it exists (for local testing)
load_dotenv()

# 2. --- ENVIRONMENT VARIABLES ---
AWS_REGION = os.environ.get("MY_AWS_REGION", "ap-south-1")
S3_BUCKET  = os.environ.get("S3_BUCKET_NAME", "kli-datascience")
S3_PREFIX  = os.environ.get("S3_FOLDER", "user_upload_files/")
SECRET_KEY = os.environ.get("SECRET_KEY", "CHANGE-THIS-TO-RANDOM-STRING")

# AWS Credentials (Netlify will inject these automatically from its dashboard)
AWS_ACCESS_KEY = os.environ.get("MY_AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.environ.get("MY_AWS_SECRET_ACCESS_KEY")

# 3. Initialize Flask App
app = Flask(__name__)
app.secret_key = SECRET_KEY

# 4. Initialize S3 Client securely
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION
)

# 5. --- DUMMY CREDENTIALS ---
# Update this with your actual required username and password
CREDENTIALS = {
    "admin": "password123" 
}

# 6. --- AUTHENTICATION DECORATOR ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function

# 7. ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def index():
    if session.get("logged_in"):
        return redirect(url_for("upload"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET"])
def login():
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data     = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if CREDENTIALS.get(username) == password:
        session["logged_in"] = True
        session["username"]  = username
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Invalid credentials"}), 401

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/upload", methods=["GET"])
@login_required
def upload():
    return render_template("upload.html", username=session.get("username"))

@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No files provided"}), 400

    files = request.files.getlist("file")
    if not files or files[0].filename == "":
        return jsonify({"success": False, "message": "No files selected"}), 400

    uploaded_filenames = []
    
    try:
        # Loop through all files uploaded
        for file in files:
            original_name = secure_filename(file.filename)
            # Use the exact original name without the UUID prefix
            exact_key = f"{S3_PREFIX}{original_name}"
            
            s3_client.upload_fileobj(
                file,
                S3_BUCKET,
                exact_key,
                ExtraArgs={"ContentType": file.content_type or "application/octet-stream"}
            )
            uploaded_filenames.append(original_name)

        return jsonify({
            "success":   True,
            "message":   f"{len(uploaded_filenames)} file(s) uploaded successfully!",
            "filenames": uploaded_filenames,
            "bucket":    S3_BUCKET,
            "folder":    S3_PREFIX
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    # This block allows you to test locally with: python app.py
    # Netlify will ignore this and use the functions/api.py bridge instead.
    app.run(host="0.0.0.0", port=5000, debug=False)