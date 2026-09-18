# Student Profile Image Upload (Amazon S3 + Amazon RDS)

This is a beginner-friendly MERN example that teaches one idea:

**The browser talks to your backend. Your backend stores the image in Amazon S3 and the student record in Amazon RDS.**

The React frontend never talks to S3 or RDS directly. AWS keys and database passwords stay on the Node.js server only.

## Architecture

```text
Browser
   ↓
Frontend (React)
   ↓ POST /api/upload
Backend (Node.js / Express)
   ├── AWS SDK → Amazon S3 → profiles/   (image file)
   └── mysql2  → Amazon RDS MySQL        (student name + file metadata)
```

After a successful upload:

- the image is in the S3 bucket under `profiles/`
- a row is saved in the `profile_images` table in RDS

`GET /api/files` reads the list from RDS, then the backend creates a short-lived S3 viewing URL for each image.

## 1. Create an S3 bucket

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/).
2. Open **Amazon S3**.
3. Click **Create bucket**.
4. Enter a globally unique bucket name, for example `student-profile-images-yourname`.
5. Choose a region close to you, for example **ap-south-1 (Mumbai)** or **us-east-1 (N. Virginia)**.
6. Keep **Block all public access** turned **ON**.
7. Click **Create bucket**.

Remember the bucket name and region. You will put both values in `.env`.

## 2. Which AWS region to select

Pick one region and use it for both S3 and RDS when possible:

- the S3 bucket region
- the RDS database region
- `AWS_REGION` in `backend/.env`

If the S3 bucket region and `AWS_REGION` do not match, uploads will fail.

Example:

```text
AWS_REGION=ap-south-1
```

## 3. Create an Amazon RDS MySQL database

1. Open **RDS** in the AWS console.
2. Click **Create database**.
3. Choose **Standard create**.
4. Engine: **MySQL**.
5. For class work, **Free tier** or **Burstable** (`db.t3.micro` / `db.t4g.micro`) is enough.
6. Set a master username, for example `admin`, and a strong password.
7. Create an initial database name: `student_profiles`.
8. Under **Connectivity**:
   - VPC: default is fine for a class demo.
   - Public access: **Yes** if you are running the Node.js backend on your laptop.
   - VPC security group: allow inbound **MySQL / TCP 3306** from **your IP address**.
9. Create the database and wait until the status is **Available**.
10. Copy the **endpoint**. It looks like:

```text
student-profiles.xxxxx.ap-south-1.rds.amazonaws.com
```

That endpoint is `RDS_HOST`. Do not use the IP address.

The backend creates this table automatically on startup:

```sql
CREATE TABLE IF NOT EXISTS profile_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_name VARCHAR(80) NOT NULL,
  s3_key VARCHAR(255) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. IAM permissions the backend needs

The backend uses IAM only for S3. RDS is accessed with the database username and password, not with IAM keys.

S3 policy:

- `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*`
- `s3:GetObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*`

Example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*"
    }
  ]
}
```

Create an access key for that IAM user. Paste the access key ID and secret access key into `.env`.

Do **not** put these keys or the RDS password in frontend JavaScript.

## 5. Configure the `.env` file

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in your values:

```text
PORT=5050
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
S3_BUCKET_NAME=your_bucket_name_here

RDS_HOST=your-db-instance.xxxxx.ap-south-1.rds.amazonaws.com
RDS_PORT=3306
RDS_DATABASE=student_profiles
RDS_USERNAME=admin
RDS_PASSWORD=your_rds_password_here
RDS_SSL=true
```

Never commit `.env`. It is already listed in `.gitignore`.

If the RDS connection fails because of SSL, you can set `RDS_SSL=false` for a classroom demo. Keep the security group limited to your IP.

## 6. Install dependencies

Backend:

```bash
cd backend
npm install
```

Frontend:

```bash
cd frontend
npm install
```

## 7. Start the backend

```bash
cd backend
npm start
```

The API should run at `http://localhost:5050`.

This project uses port `5050` because macOS often occupies port `5000`.

A successful start prints that the backend connected to Amazon RDS.

## 8. Start the frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

The React app should run at `http://localhost:5173`.

The Vite dev server proxies `/api` requests to the backend.

## 9. How to test image upload

1. Open `http://localhost:5173`.
2. Enter a student name.
3. Choose a JPEG, PNG, or WebP image smaller than 5 MB.
4. Click **Upload Image**.
5. Confirm the success message, image preview, student name, and S3 key appear.
6. Confirm the same record appears in **View Uploaded Files**.

You can also test the API directly:

```bash
curl -X POST http://localhost:5050/api/upload \
  -F "name=Ada" \
  -F "image=@./profile.jpg"
```

```bash
curl http://localhost:5050/api/files
```

## 10. Verify the object in S3 and the row in RDS

S3:

1. Open **Amazon S3** → your bucket.
2. Open the `profiles/` folder.
3. You should see a new object such as `1727000000_Ada.jpg`.

RDS:

1. Connect with any MySQL client, or use **RDS Query Editor** if available.
2. Run:

```sql
SELECT id, student_name, s3_key, original_name, created_at
FROM profile_images
ORDER BY created_at DESC;
```

3. You should see a row with the student name and S3 key.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/upload` | Upload the image to S3 and save metadata in RDS |
| GET | `/api/files` | Read saved records from RDS and return viewing URLs |

`POST /api/upload` accepts `multipart/form-data` with:

- `name`: student name
- `image`: one image file (`image/jpeg`, `image/png`, or `image/webp`)

Success response:

```json
{
  "success": true,
  "message": "Image uploaded to S3 and saved in Amazon RDS",
  "file": {
    "id": 1,
    "studentName": "Ada",
    "key": "profiles/1727000000_Ada.jpg",
    "originalName": "profile.jpg",
    "contentType": "image/jpeg",
    "url": "https://..."
  }
}
```

The `url` value is a controlled, time-limited S3 viewing link generated by the backend.

## Common errors

| What you see | What to check |
| --- | --- |
| No file selected | Choose an image before clicking Upload |
| Unsupported file type | Use JPEG, PNG, or WebP |
| File too large | Use an image under 5 MB |
| Backend unavailable | Start the Node.js server on port 5050 |
| AWS configuration is incomplete | Fill in the S3 values in `backend/.env` |
| RDS configuration is incomplete | Fill in `RDS_HOST`, `RDS_DATABASE`, `RDS_USERNAME`, and `RDS_PASSWORD` |
| Could not upload to S3 | Check bucket name, region, and IAM permissions |
| Saving the record to Amazon RDS failed | Check the RDS endpoint, password, database name, and security group port 3306 |
| Could not retrieve uploaded files from Amazon RDS | The backend cannot connect to RDS or the table query failed |

## Security notes for students

- AWS keys and the RDS password belong only in `backend/.env`.
- The frontend never uses the AWS SDK or a database client.
- Keep the S3 bucket private.
- Do not open RDS port 3306 to `0.0.0.0/0` if you can avoid it. Allow only your IP.
- The backend creates signed S3 URLs so images can be previewed without making the bucket public.
