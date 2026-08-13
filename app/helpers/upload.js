const fs = require("fs");
const { isArray } = require("./helper");
const uuidv4 = require("uuid/v4");
const axios = require("axios");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

/**
 * Object storage, written to directly.
 *
 * Files used to be posted as base64 to a separate uploader service, which then
 * wrote them to R2 - so a create depended on a second host being up, and when
 * it was not the images were silently dropped. With R2 credentials configured
 * this writes the object itself and returns the same relative path the rest of
 * the app stores, so nothing downstream changes.
 *
 * Configure in .env:
 *   R2_ACCOUNT_ID          the Cloudflare account id
 *   R2_ACCESS_KEY_ID       R2 API token key id
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name
 *   R2_ENDPOINT            optional, defaults to
 *                          https://<account>.r2.cloudflarestorage.com
 *
 * Without them the old uploader service is used, so an environment that has
 * not been given keys keeps working exactly as before.
 */
const r2Config = () => {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_ENDPOINT,
  } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  const endpoint =
    R2_ENDPOINT ||
    (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  if (!endpoint) return null;
  return { endpoint, bucket: R2_BUCKET, key: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY };
};

let r2Client = null;
const getR2Client = (cfg) => {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
    });
  }
  return r2Client;
};

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
};

const uploadToR2 = async (cfg, buffer, objectKey, extension) => {
  await getR2Client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: MIME_BY_EXTENSION[String(extension).toLowerCase()] || "application/octet-stream",
    })
  );
  return objectKey;
};

/**
 * The upload service is a separate host, and this call had no timeout.
 *
 * When that host is unreachable a single file hung until the OS gave up
 * (measured: 75 s for a 1-pixel PNG), and a create posts four images plus its
 * documents one after another - which is how POST /retailers/store came to take
 * 3.8 minutes and still save the retailer without pictures.
 *
 * So: a bounded timeout, and a short memory of failure so the second file in
 * the same request does not repeat the wait. A reachable service behaves
 * exactly as before; an unreachable one costs one timeout instead of one per
 * file. The return contract is unchanged - false on failure, and every caller
 * already treats that as "no image".
 */
const UPLOAD_TIMEOUT_MS = 30000;
const UPLOAD_FAIL_TTL_MS = 30000;
let uploadFailedAt = 0;

const base64FileUpload = async (file, filepath) => {
  try {
    if (!file) {
      return false;
    }

    if (uploadFailedAt && Date.now() - uploadFailedAt < UPLOAD_FAIL_TTL_MS) {
      return false;
    }

    const file_path = "public/uploads/" + filepath;
    let extension = file.split(";")[0].split("/")[1];
    const file_name = uuidv4() + "." + extension;
    const base64Data = file.replace(/^data:([A-Za-z-+/]+);base64,/, "");

    // straight to object storage when it is configured
    const cfg = r2Config();
    if (cfg) {
      const objectKey = file_path + "/" + file_name;
      try {
        await uploadToR2(cfg, Buffer.from(base64Data, "base64"), objectKey, extension);
        uploadFailedAt = 0;
        return { file_name: file_name, path: objectKey };
      } catch (error) {
        uploadFailedAt = Date.now();
        return false;
      }
    }

    const uploadBaseUrl = process.env.UPLOAD_BASE_URL || process.env.BASE_URL;
    if (!uploadBaseUrl) {
      return false;
    }

    let data = JSON.stringify({
      base64Image: base64Data,
      pathName: file_path,
      fileName: file_name,
    });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      timeout: UPLOAD_TIMEOUT_MS,
      url: uploadBaseUrl + "public",
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    try {
      const response = await axios.request(config);
      uploadFailedAt = 0;
      return await {
        file_name: response.data.file_name,
        path: response.data.path,
      };
    } catch (error) {
      uploadFailedAt = Date.now();
      return false; // Return false in case of an error
    }
    // return await {
    //   file_name: response.file_name,
    //   path: response.path,
    // };
  } catch (e) {
    return false; // Return false in case of an error
  }
};

const base64VideoFileUpload = async (file, filepath) => {
  try {
    const file_path = "public/uploads/" + filepath;

    const file_name = Date.now() + ".mp4";
    const path = file_path + "/" + file_name;
    file = file.replace(/^data:(.*?);base64,/, ""); // <--- make it any type
    const base64Data = file.replace(/ /g, "+");

    let data = JSON.stringify({
      base64Image: base64Data,
      pathName: file_path,
      fileName: file_name,
    });


    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: (process.env.UPLOAD_BASE_URL || process.env.BASE_URL) + "public",
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    try {
      const response = await axios.request(config);
      return {
        file_name: response.data.file_name,
        path: response.data.path,
      };
    } catch (error) {
      return false; // Return false in case of an error
    }
  } catch (e) {
    return false;
  }
};

const removeFile = (filepath) => {
  try {
    // if (fs.existsSync(filepath)) {
    //   fs.unlinkSync(filepath);
    //   return true;
    // } else {
    //   return false;
    // }
    const axios = require("axios");
    let data = { filepath: filepath };

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: (process.env.UPLOAD_BASE_URL || process.env.BASE_URL) + "remove-file",
      headers: {},
      data: data,
    };

    axios
      .request(config)
      .then((response) => {
        return true;
      })
      .catch((error) => {
        return false;
      });
  } catch (e) {
    return false;
  }
};

const filterFilesFromRemove = (files, removeFiles) => {
  if (isArray(files) && isArray(removeFiles)) {
    let newArr = [];
    for (let i = 0; i < files.length; i++) {
      let isRemove = false;
      for (let x = 0; x < removeFiles.length; x++) {
        if (files[i].file_name == removeFiles[x].file_name) {
          isRemove = true;
          break;
        }
      }
      if (isRemove) {
        removeFile(files[i].path);
      } else {
        newArr.push(files[i]);
      }
    }


    return newArr;
  } else {
    return [];
  }
};

const uploadPDF = async (
  pathName = "invoices",
  pdfBuffer,
  fileName = `file-${Date.now()}.pdf`,
) => {
  try {
    const data = {
      pdfBuffer, // Send the buffer directly
      pathName,
      fileName,
    };

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: (process.env.UPLOAD_BASE_URL || process.env.BASE_URL) + "upload-pdf",
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    const response = await axios.request(config);
    return response.data; // Return the server's response
  } catch (error) {
    return { success: false, message: error.message }; // Return error details
  }
};

module.exports = {
  base64FileUpload,
  removeFile,
  filterFilesFromRemove,
  base64VideoFileUpload,
  uploadPDF, // Export the new function
};
