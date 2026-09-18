const mysql = require("mysql2/promise");

function getMissingRdsConfig() {
  const required = ["RDS_HOST", "RDS_DATABASE", "RDS_USERNAME", "RDS_PASSWORD"];
  return required.filter((key) => !process.env[key]);
}

let pool;

function createPool() {
  if (pool) {
    return pool;
  }

  const useSsl = process.env.RDS_SSL !== "false";

  pool = mysql.createPool({
    host: process.env.RDS_HOST,
    port: Number(process.env.RDS_PORT || 3306),
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

async function initDatabase() {
  const db = createPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS profile_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_name VARCHAR(80) NOT NULL,
      s3_key VARCHAR(255) NOT NULL UNIQUE,
      original_name VARCHAR(255) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function saveProfileImage({ studentName, key, originalName, contentType }) {
  const db = createPool();
  const [result] = await db.query(
    `INSERT INTO profile_images (student_name, s3_key, original_name, content_type)
     VALUES (?, ?, ?, ?)`,
    [studentName, key, originalName, contentType]
  );

  return result.insertId;
}

async function listProfileImages() {
  const db = createPool();
  const [rows] = await db.query(
    `SELECT id, student_name, s3_key, original_name, content_type, created_at
     FROM profile_images
     ORDER BY created_at DESC`
  );

  return rows;
}

module.exports = {
  getMissingRdsConfig,
  initDatabase,
  saveProfileImage,
  listProfileImages,
};
