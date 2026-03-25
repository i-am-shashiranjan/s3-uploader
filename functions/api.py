import serverless_wsgi
import sys
import os

# Point Netlify to your main app folder
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

# Import the Flask app from the app folder
from app.app import app

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)