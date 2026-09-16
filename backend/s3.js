const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function getMissingAwsConfig() {
  const required = [
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET_NAME",
  ];

  return required.filter((key) => !process.env[key]);
}

function createS3Client() {
  const missing = getMissingAwsConfig();
  if (missing.length > 0) {
    return null;
  }

  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

async function getViewUrl(s3Client, key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  // Private objects are viewed through a short-lived signed URL.
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function uploadImage(s3Client, { key, body, contentType }) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = await getViewUrl(s3Client, key);
  return url;
}

async function listUploadedFiles(s3Client) {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: "profiles/",
    })
  );

  const objects = response.Contents || [];
  const files = [];

  for (const object of objects) {
    if (!object.Key || object.Key.endsWith("/")) {
      continue;
    }

    const url = await getViewUrl(s3Client, object.Key);
    files.push({
      key: object.Key,
      size: object.Size,
      lastModified: object.LastModified,
      url,
    });
  }

  files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return files;
}

module.exports = {
  getMissingAwsConfig,
  createS3Client,
  uploadImage,
  listUploadedFiles,
};
