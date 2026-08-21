// const db = require("@models");
const db = require("@models");
const moment = require("moment");
const fs = require("fs");
const { Op } = require("sequelize");
const CryptoJS = require("crypto-js");
const { type } = require("os");

const isToday = (someDate) => {
  if (typeof someDate == "string") {
    someDate = new Date(someDate);
  }
  const today = new Date();
  return (
    someDate.getDate() == today.getDate() &&
    someDate.getMonth() == today.getMonth() &&
    someDate.getFullYear() == today.getFullYear()
  );
};

const getItemFromMultidimensionalArray = (arr, k, id) => {
  for (i = 0; i < arr.length; i++) {
    if (arr[i][k] == id) {
      return arr[i];
    }
  }
  return false;
};

const getPlusMinus = (p) => {
  if (priceFormat(p) > 0) {
    return "+";
  }
  return "";
};

const priceFormat = (p, removeBlankZero) => {
  if (typeof p !== "undefined" && p !== null) {
    p = parseFloat(p).toFixed(2);
    p = parseFloat(p);
  } else {
    p = 0.0;
  }
  if (removeBlankZero) {
    p = p.toFixed(2).replace(/[.,]00$/, "");
    p = parseFloat(p);
  }
  return isNaN(p) ? 0 : p;
};

const removeBlankZero = (p) => {
  p = parseFloat(p);
  p = isNaN(p) ? 0 : p;
  p = p.toFixed(2).replace(/[.,]00$/, "");
  p = parseFloat(p);
  return p;
};

const getFields = (arr, field) => {
  var output = [];
  for (var i = 0; i < arr.length; ++i) output.push(arr[i][field]);
  return output;
};

const convertToString = (p) => {
  if (typeof p === "string") {
    return p;
  } else {
    return priceFormat(p).toString();
  }
};

const convertToInt = (p) => {
  return parseInt(p);
};

const isEmpty = (value) => {
  return (
    // null or undefined
    value == null ||
    value == "null" ||
    // 0 value
    value == 0 ||
    // has length and it's zero
    (value.hasOwnProperty("length") && value.length === 0) ||
    // is an Object and has no keys
    (value.constructor === Object && Object.keys(value).length === 0)
  );
};

const upperCase = (str) => {
  return str.toUpperCase();
};

const formatDateTime = (date, format) => {
  if (isEmpty(date)) {
    return "";
  }
  format = format === undefined ? 1 : format;
  switch (format) {
    case 1:
      return moment(date).format("YYYY-MM-DD HH:mm:ss");
      break;
    case 2:
      return moment(date).format("HH:mm");
      break;
    case 3:
      return moment(date).format("HH:mm:ss");
      break;
    case 4:
      return moment(date).format("DD MMM, YYYY hh:mm A");
      break;
    case 5:
      return moment(date).format("DD MMM, YYYY");
      break;
    case 6:
      return moment(date).format("hh:mm A");
      break;
    case 7:
      return moment(date).format("DD/MM/YYYY hh:mm A");
      break;
    case 8:
      return moment(date).format("DD/MM/YYYY");
      break;
    case 9:
      return moment(date).format("MM/DD/YYYY");
      break;
    case 10:
      return moment(date).format("YYYY-MM-DD");
      break;
    case 11:
      return moment(date).format("MMM YYYY");
      break;

    default:
      return moment(date).format("YYYY-MM-DD HH:mm:ss");
      break;
  }
};

const isArray = (arr) => {
  return Array.isArray(arr);
};

const isObject = (arr) => {
  return Object.prototype.toString.call(arr).indexOf("Object") > -1;
};

const convertToSlug = (Text) => {
  return Text.toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
};

const generateOrderNo = (id) => {
  let order_no = "RVO-" + id?.toString();
  return order_no;
};

const displayAmount = (amount, currencyText, showCurrency, showDecimal) => {
  amount = amount === null ? 0 : amount;
  showDecimal = showDecimal === undefined ? true : showDecimal;
  currencyText = currencyText === true ? "Rs. " : "₹";
  currencyText = showCurrency === false ? "" : currencyText;
  return showDecimal
    ? currencyText + priceFormat(amount, true).toFixed(2)
    : currencyText + priceFormat(amount, true);
};

const removeCurrency = (amount) => {
  return amount.replace("₹", "");
};

const getFileAbsulatePath = (f) => {
  return process.env.BASE_URL + f;
}

const getFileAbsulatePathPDF = (f) => {
  return process.env.BASE_URL_INVOICE + f;
}

const ucWords = (text) => {
  return !text
    ? ""
    : text.replace(
        /(^\w|\s\w)(\S*)/g,
        (_, m1, m2) => m1.toUpperCase() + m2.toLowerCase()
      );
};

const getDiscountedText = (discount, type) => {
  if (isEmpty(discount)) return "";
  if (type.toLowerCase() == "percent") {
    return Number(discount.toFixed(0)) + "% OFF";
  } else {
    return displayAmount(discount) + " OFF";
  }
};

const getDiscountedPrice = (price, discount, discount_type) => {
  if (discount > 0) {
    if (discount_type == "flat") {
      price = priceFormat(price - discount);
    } else {
      price = (price * (100 - discount)) / 100;
    }
  }
  return priceFormat(price);
};

const defaultProfileImage = (img) => {
  return process.env.BASE_URL + "public/user_image/user.jpg";
};
const logoImage = (img) => {
  return process.env.BASE_URL + "public/images/ratn_logo.jpg";
};
const defaultImage = () => {
  return process.env.BASE_URL + "public/default_image/default_image.png";
};
const noImage = () => {
  return process.env.BASE_URL + "public/images/no_image.jpg";
};

const statusDisplay = (status) => {
  switch (status) {
    case "pending":
      return "Pending";
      break;

    case "accepted":
      return "Accepted";
      break;

    case "cancelled":
      return "Cancelled";
      break;

    case "declined":
      return "Declined";
      break;

    case "shipped":
      return "Shipped";
      break;

    case "on_process":
      return "On Process";
      break;

    case "in_transit":
      return "In Transit";
      break;

    case "is_ready":
      return "Is Ready";
      break;

    case "out_for_delivery":
      return "Out For Delivery";
      break;

    case "delivered":
      return "Delivered";
      break;

    case "return_request":
      return "Return Request";
      break;

    case "picked_up":
      return "Picked Up";
      break;

    default:
      return status;
      break;
  }
};

const getDateFromToWhere = (date_from, date_to, column_name) => {
  let conditions = {};

  column_name = column_name === undefined ? "createdAt" : column_name;
  if (date_to != null && !isEmpty(date_to)) {
    date_to = date_to + " 23:59:59";
    date_to = moment(date_to, "YYYY-MM-DD HH:mm:s").format(
      "YYYY-MM-DD HH:mm:ss"
    );
  } else {
    date_to = null;
  }
  if (date_from != null && !isEmpty(date_from)) {
    date_from = date_from + " 00:00:00";
    date_from = moment(date_from, "YYYY-MM-DD HH:mm:s").format(
      "YYYY-MM-DD HH:mm:ss"
    );
  } else {
    date_from = null;
  }
  if (!isEmpty(date_from) && !isEmpty(date_to)) {
    conditions[column_name] = {
      [Op.gte]: moment(date_from).format("YYYY-MM-DD HH:mm:ss"),
      [Op.lte]: moment(date_to).format("YYYY-MM-DD HH:mm:ss"),
    };
  } else if (!isEmpty(date_from)) {
    conditions[column_name] = {
      [Op.gte]: moment(date_from).toDate(),
    };
  } else if (!isEmpty(date_to)) {
    conditions[column_name] = {
      [Op.lte]: moment(date_to).toDate(),
    };
  }

  return conditions;
};

const isNumeric = (str) => {
  //if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
};

const getRawDateWhereQuery = (date_from, date_to, tablePrefix) => {
  let wheres = [];
  tablePrefix = tablePrefix === undefined ? "" : tablePrefix + ".";
  if (!isEmpty(date_from)) {
    date_from = date_from + " 00:00:00";
    date_from = moment(date_from, "YYYY-MM-DD HH:mm:ss").format(
      "YYYY-MM-DD HH:mm:ss"
    );
    wheres.push(`${tablePrefix}created_at >= '${date_from}'`);
  }
  if (!isEmpty(date_to)) {
    date_to = date_to + " 23:59:59";
    date_to = moment(date_to, "YYYY-MM-DD HH:mm:s").format(
      "YYYY-MM-DD HH:mm:ss"
    );
    wheres.push(`${tablePrefix}created_at <= '${date_to}'`);
  }
  return wheres;
};

const addLog = (log) => {
  log = JSON.stringify(log);
  console.log("addLog : -------> ", log);
  try {
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs", { recursive: true });
    }
  } catch (e) {
    console.log("addLog mkdir error:", e && e.message ? e.message : e);
  }
  fs.appendFile("logs/request_logs.txt", log + "\n", (err) => {
    if (err) {
      console.log(err);
    }
  });
};

const socketEmit = (req, key, data) => {
  req.io.sockets.emit(`${key}`, data);
};

const encrypt = (i) => {
  i = convertToString(i);
  return CryptoJS.AES.encrypt(i, "rcFr#qh7dS73", {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  }).toString();
};

const decrypt = (i) => {
  var bytes = CryptoJS.AES.decrypt(i, "rcFr#qh7dS73");
  return bytes.toString(CryptoJS.enc.Utf8);
};

const getAppLatestVerion = (app) => {
  let app_version = "";
  switch (app) {
    case "customer":
      app_version = "1.0.10";
      break;

    default:
      break;
  }
  return app_version;
};

const uniqueId = (length) => {
  return parseInt(
    Math.ceil(Math.random() * Date.now())
      .toPrecision(length)
      .toString()
      .replace(".", "")
  );
};

const getEmptyCustomerName = () => {
  return "Anonymous";
};

const arrayColumn = (arr, col) => {
  let a = [];
  for (let i = 0; i < arr.length; i++) {
    a.push(arr[i][col]);
  }
  return a;
};

const productTypeDisplay = (type) => {
  switch (type) {
    case "in_house":
      return "In House";
      break;
    case "external":
      return "External";
      break;
    case "material":
      return "Material";
      break;
    default:
      return "";
      break;
  }
};

const priceConvertToGram = (unit, price) => {
  unit = unit.toLowerCase();
  if (unit == "carat" || unit == "carats" || unit == "ct") {
    return priceFormat(parseFloat(price) * 5);
  } else if (unit == "ratti" || unit == "rati") {
    return priceFormat(parseFloat(price) / 0.182);
  } else if (unit == "cent") {
    return priceFormat(parseFloat(price) * 500);
  } else if (unit == "gram") {
    return priceFormat(price);
  } else {
    return priceFormat(price);
  }
};

const convertUnitToGram = (unit, weight) => {
  if (isEmpty(weight)) {
    return 0;
  }
  unit = unit.toLowerCase();
  if (unit == "carat" || unit == "carats" || unit == "ct") {
    return weightFormat(parseFloat(weight) / 5);
  } else if (unit == "ratti" || unit == "rati") {
    return weightFormat(parseFloat(weight) * 0.182);
  } else if (unit == "cent") {
    return weightFormat(parseFloat(weight) / 500);
  } else {
    return weightFormat(weight);
  }
};

const convertGramToUnit = (unit, weight) => {
  if (isEmpty(weight)) {
    return 0;
  }
  unit = unit.toLowerCase();
  if (unit == "carat" || unit == "carats" || unit == "ct") {
    return weightFormat(parseFloat(weight) * 5);
  } else if (unit == "ratti" || unit == "rati") {
    return weightFormat(parseFloat(weight) * 5.494);
  } else if (unit == "cent") {
    return weightFormat(parseFloat(weight) * 500);
  } else {
    return weightFormat(weight);
  }
};

const paymentModeDisplay = (type) => {
  switch (type) {
    case "cash":
      return "Cash";
      break;
    case "bank_transfer":
      return "Bank Transfer";
      break;
    case "cheque":
      return "Cheque";
      break;
    case "upi":
      return "UPI";
      break;
    case "card":
      return "Card";
      break;
    case "phone_pay":
      return "PhonePe";
      break;
    case "g_pay":
      return "GooglePay";
      break;
    case "paytm":
      return "Paytm";
      break;
    case "online":
      return "UPI/PhonePe/GPay";
      break;
    case "advance":
      return "Advance";
      break;
    case "imps_neft":
      return "Banking/RTGS/NEFT";
      break;
    case "metal":
      return "Metal";
      break;
    default:
      return "Cash";
      break;
  }
};

const getFormatedAddress = (address) => {
  if (isEmpty(address)) return "";
  let arr = [];
  if ("street" in address && !isEmpty(address.street)) {
    arr.push(address.street);
  }
  if ("landmark" in address && !isEmpty(address.landmark)) {
    arr.push(address.landmark);
  }
  if ("city" in address && !isEmpty(address.city)) {
    arr.push(address.city);
  }
  if ("state" in address && !isEmpty(address.state)) {
    arr.push(address.state);
  }
  if ("zipcode" in address && !isEmpty(address.zipcode)) {
    arr.push(address.zipcode);
  }
  if ("country" in address && !isEmpty(address.country)) {
    arr.push(address.country);
  }
  return arr.join(", ");
};

const weightFormat = (p) => {
  if (typeof p !== "undefined" && p !== null) {
    p = parseFloat(p).toFixed(3);
    p = parseFloat(p);
  } else {
    p = 0.0;
  }
  p = p.toFixed(3).replace(/[.,]000$/, "");
  p = parseFloat(p);
  return isNaN(p) ? 0 : p;
};

const convertPerGramPriceToPerUnit = (price, unit) => {
  if (isEmpty(price) || isEmpty(unit)) {
    return 0;
  }
  unit = unit.toLowerCase();
  if (unit == "carat" || unit == "carats" || unit == "ct") {
    price = parseFloat(price) / 5;
  } else if (unit == "ratti" || unit == "rati") {
    price = parseFloat(price) * 0.182;
  } else if (unit == "cent") {
    price = parseFloat(price) / 500;
  } else if (unit == "gram") {
    price = parseFloat(price);
  }
  return priceFormat(price);
};

const getLoanEMI = (r, time, p, ret_type, interest_type) => {
  interest_type = interest_type === undefined ? "yearly" : interest_type;
  let emi = 0;
  let total_pay = 0;
  let total_interest = 0;
  var principal = p;
  var interest = interest_type != "monthly" ? r / 100 / 12 : r / 100;
  var payments = time * 12;

  // Now compute the monthly payment figure, using esoteric math.
  var x = Math.pow(1 + interest, payments);
  var monthly = (principal * x * interest) / (x - 1);

  // Check that the result is a finite number. If so, display the results.
  if (
    !isNaN(monthly) &&
    monthly != Number.POSITIVE_INFINITY &&
    monthly != Number.NEGATIVE_INFINITY
  ) {
    emi = monthly;
    total_pay = Math.round(monthly * payments * 100) / 100;
    total_interest = monthly * payments - principal;
  }
  if (ret_type == "emi") {
    return emi;
  } else if (ret_type == "total_pay") {
    return total_pay;
  } else {
    return total_interest;
  }
};

const getNotificationRedirectUrl = (type, params) => {
  let data = JSON.parse(params);
  let redirect_to = "";

  switch (type) {
    case "sale":
      if (data.is_assigned) {
        redirect_to = "/received/view/" + data.purchase_id;
      } else {
        redirect_to = "/purchases/view/" + data.purchase_id;
      }
      break;
    case "purchase_on_approval":
      redirect_to = "/purchase-on-approve/view/" + data.purchase_id;
      break;
    case "purchase_accept":
    case "purchase_declined":
      if (data.is_assigned) {
        redirect_to = "/transfer/view/" + data.sale_id;
      } else {
        redirect_to = "/sales/view/" + data.sale_id;
      }
      break;
    case "order_placed":
    case "order_cancel":
    case "order_assigned":
      redirect_to = "/orders/view/" + data.order_id;
      break;
    case "purchase_due":
      redirect_to = "/purchases/view/" + data.purchase_id;
      break;
    case "sale_due":
    case "sale_settlement":
      redirect_to = "/sales/view/" + data.sale_id;
      break;
    case "order_return_request":
    case "return_order_assigned":
      redirect_to = "/return-orders/view/" + data.return_order_id;
      break;
    case "send_money":
      redirect_to = "/wallet-history";
      break;
    case "expense":
      redirect_to = "/expenses";
      break;
    case "leave_application":
      redirect_to = "/leave-applications";
      break;
    case "sale_return":
      redirect_to = "/return-sale/view/" + data.return_id;
      break;
    case "material_stock_send":
      redirect_to = "/material-stock-history";
      break;
    case "retailer_visit":
      redirect_to = `/retailers/view/${data.retailer_id}?total_retailer=1`;
      break;
  }
  return redirect_to;
};

const shortString = (str, max) => {
  if (!str) return str;
  max = max === undefined ? 60 : max;
  return str.length > max ? str.substr(0, max) + "..." : str;
};

const isWeeklyHoliday = (date, weekly_holidays) => {
  if (isEmpty(weekly_holidays)) {
    return false;
  }
  let weekDay = moment(date).format("ddd");
  weekDay = weekDay.toLowerCase();
  return weekly_holidays[weekDay];
};

const getMonthDateRange = (year, month) => {
  // month in moment is 0 based, so 9 is actually october, subtract 1 to compensate
  // array is 'year', 'month', 'day', etc
  let startDate = moment([year, month - 1]);

  // Clone the value before .endOf()
  let endDate = moment(startDate).endOf("month");

  // make sure to call toDate() for plain JavaScript date type
  return { start: startDate, end: endDate };
};

const sanitizeJSON = (obj) => {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "string") {
            // remove invalid JSON characters
            return value.replace(/[\u0000-\u001F]+/g, "");
        }
        return value;
    });
}

const encodeForStorage = (data) => {
    const json = sanitizeJSON(data);
    return Buffer.from(json, "utf8").toString("base64");
}

const decodeFromStorage = (encoded) => {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(json);
}

function cleanInput(value) {
    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
        return value
            // remove all control chars
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            // remove invisible unicode separators
            .replace(/[\u2028\u2029]/g, "")
            // normalize unicode text (fix encoded garbage)
            .normalize("NFC")
            .trim();
    }

    if (Array.isArray(value)) {
        return value.map(cleanInput);
    }

    if (typeof value === "object") {
        const cleaned = {};
        for (const key in value) {
            cleaned[key] = cleanInput(value[key]);
        }
        return cleaned;
    }

    return value;
}


module.exports = {
  isToday,
  getItemFromMultidimensionalArray,
  getPlusMinus,
  priceFormat,
  getFields,
  convertToString,
  convertToInt,
  isEmpty,
  upperCase,
  formatDateTime,
  isArray,
  isObject,
  convertToSlug,
  displayAmount,
  getFileAbsulatePath,
  getFileAbsulatePathPDF,
  ucWords,
  getDiscountedText,
  getDiscountedPrice,
  defaultProfileImage,
  logoImage,
  statusDisplay,
  getDateFromToWhere,
  defaultImage,
  isNumeric,
  getRawDateWhereQuery,
  addLog,
  socketEmit,
  encrypt,
  decrypt,
  getAppLatestVerion,
  uniqueId,
  getEmptyCustomerName,
  arrayColumn,
  productTypeDisplay,
  generateOrderNo,
  priceConvertToGram,
  getFileAbsulatePathPDF,
  convertUnitToGram,
  paymentModeDisplay,
  getFormatedAddress,
  weightFormat,
  convertPerGramPriceToPerUnit,
  getLoanEMI,
  getNotificationRedirectUrl,
  shortString,
  isWeeklyHoliday,
  convertGramToUnit,
  noImage,
  removeCurrency,
  getMonthDateRange,
  removeBlankZero,
  encodeForStorage,
  decodeFromStorage,
  cleanInput
};
