const fs = require("fs");
const { isArray } = require("./helper");
const uuidv4 = require("uuid/v4");
const axios = require("axios");

const base64FileUpload = async (file, filepath) => {
  try {
    if (!file) {
      return false;
    }

    const uploadBaseUrl = process.env.UPLOAD_BASE_URL || process.env.BASE_URL;
    if (!uploadBaseUrl) {
      return false;
    }

    const file_path = "public/uploads/" + filepath;
    let extension = file.split(";")[0].split("/")[1];
    const file_name = uuidv4() + "." + extension;
    const base64Data = file.replace(/^data:([A-Za-z-+/]+);base64,/, "");

    let data = JSON.stringify({
      base64Image: base64Data,
      pathName: file_path,
      fileName: file_name,
    });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: uploadBaseUrl + "public",
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };

    try {
      const response = await axios.request(config);
      return await {
        file_name: response.data.file_name,
        path: response.data.path,
      };
    } catch (error) {
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
