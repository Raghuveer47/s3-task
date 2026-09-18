const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const {
  getMissingAwsConfig,
  createS3Client,
  getViewUrl,
  uploadImage,
} = require("./s3");
const {
  getMissingRdsConfig,
  initDatabase,
  saveProfileImage,
  listProfileImages,
} = require("./db");

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

function awsConfigError() {
  return {
    success: false,
    message:
      "AWS configuration is incomplete. Check the backend .env file and restart the server.",
  };
}

function rdsConfigError() {
  return {
    success: false,
    message:
      "RDS configuration is incomplete. Check RDS_HOST, RDS_DATABASE, RDS_USERNAME, and RDS_PASSWORD in backend/.env.",
  };
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

    const studentName = String(req.body.name || "").trim().slice(0, 80);
    if (!studentName) {
      return res.status(400).json({
        success: false,
        message: "Please enter the student name.",
      });
    }

    if (getMissingAwsConfig().length > 0) {
      return res.status(500).json(awsConfigError());
    }

    if (getMissingRdsConfig().length > 0) {
      return res.status(500).json(rdsConfigError());
    }

    const s3Client = createS3Client();
    if (!s3Client) {
      return res.status(500).json({
        success: false,
        message: "Could not create the Amazon S3 client. Check your AWS settings.",
      });
    }

    const key = `profiles/${Date.now()}_${sanitizeName(studentName)}${getExtension(
      req.file.originalname,
      req.file.mimetype
    )}`;

    try {
      const url = await uploadImage(s3Client, {
        key,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });

      let recordId;
      try {
        recordId = await saveProfileImage({
          studentName,
          key,
          originalName: req.file.originalname,
          contentType: req.file.mimetype,
        });
      } catch (dbError) {
        console.error("RDS save failed:", dbError.code || dbError.name || "Error");
        return res.status(500).json({
          success: false,
          message:
            "The image was uploaded to S3, but saving the record to Amazon RDS failed. Check the RDS endpoint, database name, username, password, and security group.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Image uploaded to S3 and saved in Amazon RDS",
        file: {
          id: recordId,
          studentName,
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

app.get("/api/files", async (req, res) => {
  if (getMissingAwsConfig().length > 0) {
    return res.status(500).json(awsConfigError());
  }

  if (getMissingRdsConfig().length > 0) {
    return res.status(500).json(rdsConfigError());
  }

  const s3Client = createS3Client();
  if (!s3Client) {
    return res.status(500).json({
      success: false,
      message: "Could not create the Amazon S3 client. Check your AWS settings.",
    });
  }

  try {
    const rows = await listProfileImages();
    const files = [];

    for (const row of rows) {
      const url = await getViewUrl(s3Client, row.s3_key);
      files.push({
        id: row.id,
        studentName: row.student_name,
        key: row.s3_key,
        originalName: row.original_name,
        contentType: row.content_type,
        createdAt: row.created_at,
        url,
      });
    }

    return res.json({
      success: true,
      message:
        files.length === 0
          ? "No uploaded files yet. Upload a profile image to get started."
          : "Uploaded files retrieved from Amazon RDS",
      files,
    });
  } catch (error) {
    console.error("RDS list failed:", error.code || error.name || "Error");
    return res.status(500).json({
      success: false,
      message:
        "Could not retrieve uploaded files from Amazon RDS. Check the RDS endpoint, database name, username, password, and security group.",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  if (getMissingAwsConfig().length > 0) {
    console.warn(
      "AWS configuration is incomplete. Copy backend/.env.example to backend/.env and fill in your S3 values."
    );
  }

  if (getMissingRdsConfig().length > 0) {
    console.warn(
      "RDS configuration is incomplete. Add RDS_HOST, RDS_DATABASE, RDS_USERNAME, and RDS_PASSWORD to backend/.env."
    );
    return;
  }

  try {
    await initDatabase();
    console.log("Connected to Amazon RDS and ready to store profile records.");
  } catch (error) {
    console.error(
      "Could not connect to Amazon RDS. Check the endpoint, security group, and database credentials."
    );
  }
});
