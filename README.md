# S3 File Uploader — Your AWS Config

## YOUR AWS Details (already filled in everywhere)
| Setting | Value |
|---|---|
| Account ID | 794252461572 |
| Region | ap-south-1 (Mumbai) |
| Bucket | kli-datascience |
| Upload Path | s3://kli-datascience/user_upload_files/ |
| Login | admin / apna_kaam_kar |

---

## WHAT CHANGED FROM GENERIC CODE

| File | What Changed |
|---|---|
| app/app.py | S3_BUCKET="kli-datascience", S3_PREFIX="user_upload_files/", AWS_REGION="ap-south-1" |
| deployment/ecs-task-definition.json | Account ID, ECR image URI, region, bucket, prefix |
| deployment/iam-s3-policy.json | ARN updated to kli-datascience bucket |
| deploy.sh | Account ID and region filled in |
| docker-compose.yml | Region and bucket filled in |

---

## STEP 1 — RUN LOCALLY ON YOUR LAPTOP

### Option A — Pure Python (Simplest, no Docker needed)

**Prerequisites: Python 3.9+ installed on laptop**

```bash
# 1. Unzip and go into project
cd s3-uploader

# 2. Install Python dependencies
cd app
pip install -r requirements.txt

# 3. Configure your AWS credentials on laptop
aws configure
#   AWS Access Key ID: YOUR_ACCESS_KEY
#   AWS Secret Access Key: YOUR_SECRET_KEY
#   Default region: ap-south-1
#   Default output: json

# 4. Set environment variables
# On Mac/Linux:
export S3_BUCKET_NAME=kli-datascience
export S3_PREFIX=user_upload_files/
export AWS_REGION=ap-south-1
export SECRET_KEY=local-dev-secret

# On Windows (Command Prompt):
set S3_BUCKET_NAME=kli-datascience
set S3_PREFIX=user_upload_files/
set AWS_REGION=ap-south-1
set SECRET_KEY=local-dev-secret

# 5. Run the app
flask --app app run --debug

# 6. Open browser at:
#    http://localhost:5000
#    Username: admin
#    Password: apna_kaam_kar
```

### Option B — Docker (if Docker Desktop is installed)

```bash
cd s3-uploader

# Set your AWS keys in terminal first
export AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY

# Build and run
docker-compose up --build

# Open browser at http://localhost:5000
```

---

## STEP 2 — VERIFY YOUR AWS PERMISSIONS

Your AWS user/role needs permission to write to the bucket.
Run this test from your laptop to confirm:

```bash
echo "test" > test.txt
aws s3 cp test.txt s3://kli-datascience/user_upload_files/test.txt --region ap-south-1
# Should say: upload: ./test.txt to s3://kli-datascience/user_upload_files/test.txt

# Clean up
aws s3 rm s3://kli-datascience/user_upload_files/test.txt
rm test.txt
```

If that works — your local app will work too.

---

## STEP 3 — DEPLOY TO ECS FARGATE

### 3a. Create ECR Repository (one time only)

```bash
aws ecr create-repository \
  --repository-name s3-uploader \
  --region ap-south-1
```

Expected output shows URI:
794252461572.dkr.ecr.ap-south-1.amazonaws.com/s3-uploader

### 3b. Create IAM Task Role (one time only)

```bash
# Create role
aws iam create-role \
  --role-name s3UploaderTaskRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

# Create S3 policy
aws iam create-policy \
  --policy-name S3UploaderPolicy \
  --policy-document file://deployment/iam-s3-policy.json

# Attach policy to role
aws iam attach-role-policy \
  --role-name s3UploaderTaskRole \
  --policy-arn arn:aws:iam::794252461572:policy/S3UploaderPolicy

# Ensure execution role exists
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### 3c. Create CloudWatch Log Group (one time only)

```bash
aws logs create-log-group \
  --log-group-name /ecs/s3-uploader \
  --region ap-south-1
```

### 3d. Create ECS Cluster (one time only)

```bash
aws ecs create-cluster \
  --cluster-name s3-uploader-cluster \
  --capacity-providers FARGATE \
  --region ap-south-1
```

### 3e. Build & Push Docker Image

```bash
# From the s3-uploader/ root folder:

# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  794252461572.dkr.ecr.ap-south-1.amazonaws.com

# Build
docker build -t s3-uploader:latest .

# Tag
docker tag s3-uploader:latest \
  794252461572.dkr.ecr.ap-south-1.amazonaws.com/s3-uploader:latest

# Push
docker push \
  794252461572.dkr.ecr.ap-south-1.amazonaws.com/s3-uploader:latest
```

### 3f. Register Task Definition

```bash
# Edit SECRET_KEY in deployment/ecs-task-definition.json first!
# Change: "CHANGE_THIS_TO_A_RANDOM_SECRET_STRING"
# To any random string like: "Kx9mP2nQ8vL5jR3w"

aws ecs register-task-definition \
  --cli-input-json file://deployment/ecs-task-definition.json \
  --region ap-south-1
```

### 3g. Find Your VPC Subnet & Security Group

```bash
# List your subnets
aws ec2 describe-subnets \
  --region ap-south-1 \
  --query 'Subnets[*].[SubnetId,VpcId,AvailabilityZone,Tags[?Key==`Name`].Value|[0]]' \
  --output table

# List security groups
aws ec2 describe-security-groups \
  --region ap-south-1 \
  --query 'SecurityGroups[*].[GroupId,GroupName,VpcId]' \
  --output table
```

IMPORTANT: Your security group must allow inbound TCP port 5000 from 0.0.0.0/0

Add that rule if missing:
```bash
aws ec2 authorize-security-group-ingress \
  --group-id YOUR_SECURITY_GROUP_ID \
  --protocol tcp \
  --port 5000 \
  --cidr 0.0.0.0/0 \
  --region ap-south-1
```

### 3h. Create ECS Service

```bash
aws ecs create-service \
  --cluster s3-uploader-cluster \
  --service-name s3-uploader-service \
  --task-definition s3-uploader-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[YOUR_SUBNET_ID],
    securityGroups=[YOUR_SECURITY_GROUP_ID],
    assignPublicIp=ENABLED
  }" \
  --region ap-south-1
```

### 3i. Get Public IP of Running Task

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster s3-uploader-cluster \
  --service-name s3-uploader-service \
  --region ap-south-1 \
  --query 'taskArns[0]' --output text)

echo "Task ARN: $TASK_ARN"

# Get network interface
ENI=$(aws ecs describe-tasks \
  --cluster s3-uploader-cluster \
  --tasks $TASK_ARN \
  --region ap-south-1 \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text)

# Get public IP
PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids $ENI \
  --region ap-south-1 \
  --query 'NetworkInterfaces[0].Association.PublicIp' \
  --output text)

echo "Visit: http://$PUBLIC_IP:5000"
```

---

## STEP 4 — FUTURE DEPLOYS (after code changes)

```bash
# From s3-uploader/ folder — one command does everything:
./deploy.sh
```

---

## VERIFY UPLOADS IN S3

After uploading a file, verify in AWS Console:
https://s3.console.aws.amazon.com/s3/buckets/kli-datascience?prefix=user_upload_files/&region=ap-south-1

Or via CLI:
```bash
aws s3 ls s3://kli-datascience/user_upload_files/ --region ap-south-1
```

---

## FOLDER STRUCTURE

```
s3-uploader/
├── app/
│   ├── app.py                   <- Flask backend (MAIN FILE)
│   ├── requirements.txt         <- flask, boto3, gunicorn
│   ├── templates/
│   │   ├── login.html           <- Animated login page
│   │   └── upload.html          <- Upload interface
│   └── static/
│       ├── css/
│       │   ├── login.css
│       │   └── upload.css
│       └── js/
│           ├── login.js
│           └── upload.js
├── deployment/
│   ├── ecs-task-definition.json <- ECS Fargate task (YOUR ACCOUNT FILLED)
│   └── iam-s3-policy.json       <- S3 permissions (kli-datascience)
├── Dockerfile                   <- Multi-stage build
├── docker-compose.yml           <- Local dev
├── deploy.sh                    <- One-command deploy
└── README.md                    <- This file
```
README.md