# Student Profile Image Upload (Amazon S3 + Amazon DynamoDB)

This is a beginner-friendly MERN example that teaches one idea:

**The browser talks to your backend. Your backend stores the image in Amazon S3 and the student record in Amazon DynamoDB.**

The React frontend never talks to S3 or DynamoDB directly. AWS keys stay on the Node.js server only.

## Architecture

```text
Browser
   ↓
Frontend (React)
   ↓ POST /api/upload
Backend (Node.js / Express)
   ├── AWS SDK → Amazon S3 → profiles/     (image file)
   └── AWS SDK → Amazon DynamoDB           (student name + file metadata)
```

After a successful upload:

- the image is in the S3 bucket under `profiles/`
- an item is saved in the DynamoDB table

`GET /api/files` reads the list from DynamoDB, then the backend creates a short-lived S3 viewing URL for each image.

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

Pick one region and use it for both S3 and DynamoDB:

- the S3 bucket region
- the DynamoDB table region
- `AWS_REGION` in `backend/.env`

If these values do not match, uploads or table access will fail.

Example:

```text
AWS_REGION=ap-south-1
```

## 3. Create an Amazon DynamoDB table

You can let the backend create the table on startup, or create it yourself in the console.

Console steps:

1. Open **DynamoDB**.
2. Click **Create table**.
3. Table name: `profile_images`
4. Partition key: `id` (String)
5. Keep the default on-demand capacity settings.
6. Create the table in the **same region** as your S3 bucket.

Table item shape:

```text
id            String   unique record id
studentName   String   student name
s3Key         String   profiles/1727000000_Ada.jpg
originalName  String   profile.jpg
contentType   String   image/jpeg
createdAt     String   ISO timestamp
```

If the table does not exist, the backend creates it automatically with partition key `id`.

## 4. IAM permissions the backend needs

The same IAM user now needs S3 and DynamoDB permissions.

- `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*`
- `s3:GetObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*`
- `dynamodb:PutItem` on the table
- `dynamodb:Scan` on the table
- `dynamodb:DescribeTable` on the table
- `dynamodb:CreateTable` if you want the backend to create the table

Example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/profiles/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:Scan",
        "dynamodb:DescribeTable",
        "dynamodb:CreateTable"
      ],
      "Resource": "arn:aws:dynamodb:YOUR_REGION:YOUR_ACCOUNT_ID:table/profile_images"
    }
  ]
}
```

Do **not** put AWS keys in frontend JavaScript.

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
DYNAMODB_TABLE_NAME=profile_images
```

Remove any old `RDS_*` values. They are no longer used.

Never commit `.env`. It is already listed in `.gitignore`.

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

A successful start prints that the backend connected to Amazon DynamoDB.

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

## 10. Verify the object in S3 and the item in DynamoDB

S3:

1. Open **Amazon S3** → your bucket.
2. Open the `profiles/` folder.
3. You should see a new object such as `1727000000_Ada.jpg`.

DynamoDB:

1. Open **DynamoDB** → **Explore items**.
2. Open the `profile_images` table.
3. You should see an item with the student name and S3 key.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/upload` | Upload the image to S3 and save metadata in DynamoDB |
| GET | `/api/files` | Read saved records from DynamoDB and return viewing URLs |

`POST /api/upload` accepts `multipart/form-data` with:

- `name`: student name
- `image`: one image file (`image/jpeg`, `image/png`, or `image/webp`)

Success response:

```json
{
  "success": true,
  "message": "Image uploaded to S3 and saved in Amazon DynamoDB",
  "file": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
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
| DynamoDB configuration is incomplete | Add `DYNAMODB_TABLE_NAME` to `backend/.env` |
| Could not upload to S3 | Check bucket name, region, and IAM permissions |
| Saving the record to DynamoDB failed | Check the table name, region, and DynamoDB IAM permissions |
| Could not retrieve uploaded files from DynamoDB | The backend cannot read the table |

## Security notes for students

- AWS keys belong only in `backend/.env`.
- The frontend never uses the AWS SDK.
- Keep the S3 bucket private.
- The backend creates signed S3 URLs so images can be previewed without making the bucket public.
