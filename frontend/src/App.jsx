import { useEffect, useState } from "react";
import "./App.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function App() {
  const [studentName, setStudentName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [listStatus, setListStatus] = useState({ type: "", message: "" });
  const [uploadedFile, setUploadedFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  async function loadFiles() {
    setIsLoadingFiles(true);

    try {
      const response = await fetch("/api/files");
      const data = await response.json();

      if (!response.ok || !data.success) {
        setListStatus({
          type: "error",
          message: data.message || "Failed to load uploaded files.",
        });
        setFiles([]);
        return;
      }

      setFiles(data.files || []);
      setListStatus({
        type: data.files && data.files.length === 0 ? "info" : "",
        message:
          data.files && data.files.length === 0
            ? data.message || "No uploaded files yet. Upload a profile image to get started."
            : "",
      });
    } catch (error) {
      setListStatus({
        type: "error",
        message:
          "Backend unavailable. Start the Node.js server on port 5050 and try again.",
      });
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  function validateForm() {
    if (!studentName.trim()) {
      return "Please enter the student name.";
    }

    if (!selectedFile) {
      return "No file selected. Please choose a profile image.";
    }

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      return "Unsupported file type. Please upload a JPEG, PNG, or WebP image.";
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      return "File is too large. Maximum size is 5 MB.";
    }

    return "";
  }

  async function handleUpload(event) {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      setStatus({ type: "error", message: validationMessage });
      return;
    }

    const formData = new FormData();
    formData.append("name", studentName.trim());
    formData.append("image", selectedFile);

    setIsUploading(true);
    setStatus({ type: "info", message: "Uploading image to S3 and saving the record in DynamoDB..." });

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setStatus({
          type: "error",
          message: data.message || "Image upload failed.",
        });
        return;
      }

      setUploadedFile(data.file);
      setStatus({
        type: "success",
        message: data.message || "Image uploaded successfully.",
      });
      await loadFiles();
    } catch (error) {
      setStatus({
        type: "error",
        message:
          "Backend unavailable. Start the Node.js server on port 5050 and try again.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Student Profile Image Upload</h1>
        <p>
          This app teaches the path from the browser to a Node.js backend, then
          to Amazon S3 for the image and Amazon DynamoDB for the student record.
        </p>
        <p className="architecture">
          Browser → React frontend → Express backend → Amazon S3 (image) +
          Amazon DynamoDB (student data)
        </p>
      </header>

      <section className="card">
        <h2>Upload a profile image</h2>
        <form onSubmit={handleUpload}>
          <div className="field">
            <label htmlFor="studentName">Student Name</label>
            <input
              id="studentName"
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Enter student name"
            />
          </div>

          <div className="field">
            <label htmlFor="profileImage">Profile Image</label>
            <input
              id="profileImage"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setSelectedFile(event.target.files[0] || null)
              }
            />
          </div>

          <button type="submit" disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload Image"}
          </button>
        </form>

        {status.message && (
          <div className={`status ${status.type}`}>{status.message}</div>
        )}

        {uploadedFile && (
          <div className="preview">
            <h3>Uploaded image</h3>
            <p>
              <strong>Student name:</strong> {uploadedFile.studentName}
            </p>
            <p>
              <strong>File name:</strong> {uploadedFile.originalName}
            </p>
            <p>
              <strong>S3 key:</strong> {uploadedFile.key}
            </p>
            {uploadedFile.url && (
              <img src={uploadedFile.url} alt="Uploaded profile" />
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>View Uploaded Files</h2>
        <button type="button" onClick={loadFiles} disabled={isLoadingFiles}>
          {isLoadingFiles ? "Loading..." : "Refresh file list"}
        </button>

        {listStatus.message && (
          <div className={`status ${listStatus.type}`}>{listStatus.message}</div>
        )}

        {isLoadingFiles && files.length === 0 && (
          <p className="empty">Loading files from Amazon DynamoDB...</p>
        )}

        {files.length > 0 && (
          <div className="file-list">
            {files.map((file) => (
              <article className="file-card" key={file.id || file.key}>
                {file.studentName && (
                  <p>
                    <strong>Student name:</strong> {file.studentName}
                  </p>
                )}
                <p>
                  <strong>File name:</strong> {file.originalName || file.key}
                </p>
                <p>
                  <strong>S3 key:</strong> {file.key}
                </p>
                {file.url && (
                  <img src={file.url} alt={file.key} />
                )}
                {file.url && (
                  <p>
                    <a href={file.url} target="_blank" rel="noreferrer">
                      View / Open
                    </a>
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
