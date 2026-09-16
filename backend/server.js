const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const {
  getMissingAwsConfig,
  createS3Client,
  uploadImage,
  listUploadedFiles,
} = require("./s3");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    const error = new Error(
      "Unsupported file type. Please upload a JPEG, PNG, or WebP image."
    );
    error.statusCode = 400;
    cb(error);
  },
});

app.use(cors());
app.use(express.json());

function sanitizeName(value) {
  return String(value || "student")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40) || "student";
}

function getExtension(originalName, contentType) {
  const fromName = path.extname(originalName || "").toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
}

function requireS3(req, res, next) {
  const missing = getMissingAwsConfig();
  if (missing.length > 0) {
    return res.status(500).json({
      success: false,
      message:
        "AWS configuration is incomplete. Check the backend .env file and restart the server.",
    });
  }

  const s3Client = createS3Client();
  if (!s3Client) {
    return res.status(500).json({
      success: false,
      message: "Could not create the Amazon S3 client. Check your AWS settings.",
    });
  }

  req.s3Client = s3Client;
  next();
}

app.post("/api/upload", (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File is too large. Maximum size is 5 MB.",
        });
      }

      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message || "Could not process the uploaded file.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file selected. Please choose a profile image.",
      });
    }

    const missing = getMissingAwsConfig();
    if (missing.length > 0) {
      return res.status(500).json({
        success: false,
        message:
          "AWS configuration is incomplete. Check the backend .env file and restart the server.",
      });
    }

    const s3Client = createS3Client();
    if (!s3Client) {
      return res.status(500).json({
        success: false,
        message: "Could not create the Amazon S3 client. Check your AWS settings.",
      });
    }

    const studentName = sanitizeName(req.body.name);
    const extension = getExtension(req.file.originalname, req.file.mimetype);
    const key = `profiles/${Date.now()}_${studentName}${extension}`;

    try {
      const url = await uploadImage(s3Client, {
        key,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });

      return res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        file: {
          key,
          originalName: req.file.originalname,
          contentType: req.file.mimetype,
          url,
        },
      });
    } catch (error) {
      console.error("S3 upload failed:", error.name || "Error");
      return res.status(500).json({
        success: false,
        message:
          "Could not upload the image to Amazon S3. Check the bucket name, region, and IAM permissions.",
      });
    }
  });
});

app.get("/api/files", requireS3, async (req, res) => {
  try {
    const files = await listUploadedFiles(req.s3Client);

    return res.json({
      success: true,
      message:
        files.length === 0
          ? "No uploaded files yet. Upload a profile image to get started."
          : "Uploaded files retrieved successfully",
      files,
    });
  } catch (error) {
    console.error("S3 list failed:", error.name || "Error");
    return res.status(500).json({
      success: false,
      message:
        "Could not retrieve uploaded files from Amazon S3. Check your bucket name, region, and IAM permissions.",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

app.listen(PORT, () => {
  const missing = getMissingAwsConfig();
  console.log(`Backend running on http://localhost:${PORT}`);

  if (missing.length > 0) {
    console.warn(
      "AWS configuration is incomplete. Copy backend/.env.example to backend/.env and fill in your values."
    );
  }
});
