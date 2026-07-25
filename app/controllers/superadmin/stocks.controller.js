const config = require("@config/auth.config");
const {
  errorCodes,
  formatErrorResponse,
  formatResponse,
} = require("@utils/response.config");
const db = require("@models");
const sequelize = db.sequelize;
const { Op, QueryTypes } = require("sequelize");
const { getPaginationOptions } = require("@helpers/paginator");
const { UnitCollection } = require("@resources/superadmin/UnitCollection");
const { StocksCollection } = require("@resources/superadmin/StocksCollection");
const {
  StocksMaterialCollection,
} = require("@resources/superadmin/StocksMaterialCollection");
const { StocksReportCollection } = require("@resources/superadmin/StocksReportCollection");
const {
  StocksMaterialReportCollection,
} = require("@resources/superadmin/StocksMaterialReportCollection");
const stocksModel = db.stocks;
const {
  isEmpty,
  weightFormat,
  priceFormat,
  convertUnitToGram,
  addLog,
  arrayColumn,
  displayAmount,
} = require("@helpers/helper");
const { getFileAbsulatePathPDF } = require("@helpers/helper");
const { base64FileUpload, removeFile } = require("@helpers/upload");
const {
  getTotalStockPriceByUser,
  getWorkingUserID,
  isSuperAdmin,
  isAdmin,
  getStockUserID,
  isManager,
  updateOrCreate,
  getRoleId,
  getSuperAdminId,
  getUserColumnValue,
  avlStockUserIdsNew,
} = require("@library/common");
const { isDistributor, isSalesExecutive } = require("../../library/common");
const { convertToSlug } = require("../../helpers/helper");
const Role = db.roles;
const productsModel = db.products;
const sizesModel = db.sizes;
const stock_materialsModel = db.stock_materials;
const materialModel = db.materials;
const UnitModel = db.units;
const PurityModel = db.purities;
const TaxSlabModel = db.tax_slabs;
const SubCategoryModel = db.sub_categories;
const CategoryModel = db.categories;
const CertificateModel = db.certificates;
const PurchaseProductModel = db.purchase_products;
const PurchaseModel = db.purchases;
const UserModel = db.users;
const SaleModel = db.sales;
const SaleProductModel = db.sale_products;
const fs = require("fs");

/**
 * Generate sub-category wise current stock PDF report
 */
exports.currentStockReportPdf = async (req, res) => {
  try {
    // allow only superadmin or admin
    if (!isSuperAdmin(req) && !isAdmin(req)) {
      return res.status(errorCodes.auth).send(formatErrorResponse("Unauthorized"));
    }
    let { category_id, sub_category_id, type } = req.query;
    type = type === undefined ? "product" : type;

    // Determine user scope for stocks
    let userID = await getStockUserID(req);
    console.log("req.userId : ", req.userId);
    let userDtls = await UserModel.findByPk(req.userId);
    let role = await Role.findByPk(userDtls.role_id);
    console.log('role : ', role);
    let roleName = role ? role.name : "user";

    let conditions = { type };
    if (!isEmpty(category_id)) {
      // apply at product/material include level later
      // keep productConditions to apply to include
    }

    // reuse include structure from index
    let stockMaterialConditions = {};
    let productConditions = {};
    if (!isEmpty(category_id)) productConditions.category_id = category_id;
    if (!isEmpty(sub_category_id)) productConditions.sub_category_id = sub_category_id;

    let _include = [
      {
        model: stock_materialsModel,
        as: "stockMaterials",
        required: true,
        where: stockMaterialConditions,
        include: [
          { model: materialModel, as: "material" },
          { model: UnitModel, as: "unit" },
          { model: PurityModel, as: "purity" },
        ],
      },
      { model: UserModel, as: "user" },
      { model: PurityModel, as: "spurity", required: false },
    ];

    if (type == "product" || type == "return") {
      _include.push({ model: sizesModel, as: "size", required: false });
      _include.push({
        model: productsModel,
        as: "product",
        required: true,
        where: productConditions,
        include: [
          { model: CategoryModel, as: "category" },
          { model: SubCategoryModel, as: "sub_category" },
          { model: CertificateModel, as: "certificates" },
          { model: TaxSlabModel, as: "tax" },
        ],
      });
    } else {
      _include.push({
        model: materialModel,
        as: "material",
        required: true,
        where: productConditions,
        include: [{ model: CategoryModel, as: "category" }, { model: PurityModel, as: "purities" }],
      });
    }

    // scope user_id to available stock user ids
    conditions.user_id = await getStockUserID(req, req.userId);

    const rows = await stocksModel.findAll({ where: conditions, include: _include, order: [["id", "DESC"]] });

    const items =
      type == "product" || type == "return"
        ? await StocksReportCollection(rows, req.userId, roleName)
        : await StocksMaterialReportCollection(rows, req.userId, roleName);

    const normalizeMaterialKey = (mat) => {
      const materialName = mat.material_name ? String(mat.material_name).trim().toLowerCase() : String(mat.material_id || '').trim();
      const unitName = mat.unit_name ? String(mat.unit_name).trim().toLowerCase() : '';
      const purityName = mat.purity_name ? String(mat.purity_name).trim().toLowerCase() : '';
      return `${materialName}||${unitName}||${purityName}`;
    };

    const mergeMaterialTotals = (existing, incoming) => {
      const map = {};
      existing.forEach((mat) => {
        const key = normalizeMaterialKey(mat);
        map[key] = {
          ...mat,
          weight: Number(mat.weight || 0),
          quantity: Number(mat.quantity || 0),
        };
      });
      incoming.forEach((mat) => {
        const key = normalizeMaterialKey(mat);
        if (!map[key]) {
          map[key] = {
            ...mat,
            weight: Number(mat.weight || 0),
            quantity: Number(mat.quantity || 0),
          };
        } else {
          map[key].weight += Number(mat.weight || 0);
          map[key].quantity += Number(mat.quantity || 0);
        }
      });
      return Object.values(map);
    };

    const aggregateSameProducts = (rows) => {
      const grouped = {};
      for (const item of rows) {
        const key = `${item.product_id || ''}`;
        const qty = Number(item.quantity || 0);
        const weight = Number(item.total_weight || 0);
        const price = Number(item.mrp || 0);
        if (!grouped[key]) {
          grouped[key] = {
            ...item,
            quantity: qty,
            total_weight: weight,
            mrp: price,
            stock_materials: mergeMaterialTotals([], item.stock_materials || []),
          };
        } else {
          grouped[key].quantity += qty;
          grouped[key].total_weight += weight;
          grouped[key].mrp += price;
          grouped[key].stock_materials = mergeMaterialTotals(grouped[key].stock_materials, item.stock_materials || []);
        }
      }
      return Object.values(grouped).map((item) => {
        return {
          ...item,
          total_weight_display:
            item.stock_materials && item.stock_materials.length === 1
              ? `${weightFormat(item.stock_materials[0].weight)} ${item.stock_materials[0].unit_name || ''}`
              : `${weightFormat(item.total_weight)} gm`,
          mrp_display: displayAmount(item.mrp, false, true, true),
        };
      });
    };

    const reportItems = aggregateSameProducts(items);

    const aggregateMaterialDisplay = (materials) => {
      const map = {};
      for (const mat of materials || []) {
        const materialName = mat.material_name ? String(mat.material_name).trim() : String(mat.material_id || 'Unknown').trim();
        const unitName = mat.unit_name ? String(mat.unit_name).trim() : '';
        const key = `${materialName.toLowerCase()}||${unitName.toLowerCase()}`;
        const weight = Number(mat.weight || mat.quantity || 0) || 0;
        if (!map[key]) {
          map[key] = {
            ...mat,
            material_name: materialName,
            weight,
            quantity: Number(mat.quantity || 0) || 0,
          };
        } else {
          map[key].weight += weight;
          map[key].quantity += Number(mat.quantity || 0) || 0;
        }
      }
      return Object.values(map);
    };

    // group by sub category
    let groups = {};
    // accumulate material-wise totals across the whole report
    let materialTotals = {};
    // overall totals across all products
    let overallTotals = { total_qty: 0, total_weight: 0, total_value: 0 };
    for (let it of reportItems) {
      // Use the name property of sub_category/category objects instead of the objects themselves
      let key = (it.sub_category && it.sub_category.name) || (it.category && it.category.name) || "Others";
      if (!groups[key]) groups[key] = { items: [], total_qty: 0, total_weight: 0, total_value: 0 };
      groups[key].items.push(it);
      groups[key].total_qty += Number(it.quantity || 0);
      groups[key].total_weight += Number(it.total_weight || 0);
      groups[key].total_value += Number(it.mrp || 0);
      // accumulate overall totals
      overallTotals.total_qty += Number(it.quantity || 0);
      overallTotals.total_weight += Number(it.total_weight || 0);
      overallTotals.total_value += Number(it.mrp || 0);
    }

    console.log("group stocks : ", groups);

    // Fetch logged-in user details
    const user = await UserModel.findByPk(req.userId);
    const userName = user ? user.name : "User";
    const userCompany = user ? user.company_name : "Prakriti Head Office";
    const userAddress = user ? (user.address || "Patna, Bihar") : "Patna, Bihar";
    const userCity = user ? (user.city || "Patna") : "Patna";
    const userPincode = user ? (user.pincode || "800020") : "800020";
    const userGst = user ? (user.gst || "19ABAFR4515L1ZZ") : "19ABAFR4515L1ZZ";
    const userMobile = user ? (user.mobile || "N/A") : "N/A";

    // Build HTML using purchase invoice design for consistent printable layout
    const cwd = process.cwd();
    const logoUrl = `public/images/logo.png`;
    let logo = "";
    try {
      const bitmap = fs.readFileSync(logoUrl);
      logo = bitmap.toString("base64");
    } catch (e) {
      // ignore if logo not found
      logo = "";
    }
    
    // Header HTML matching purchase invoice format
    let headerhtml = `
        <table cellspacing="0" cellpadding="0" border="0" align="center" width="100%">
            <div style="display: table; width: 100%;">
                <div style="width: 65%; display: table-cell; vertical-align: bottom;">
                    <img src="data:image/png;base64,${logo}" style="width: 220px; margin-left: 10px;">
                    <h3 style="margin: 0; font-weight: 400; font-size: 12px;">Corporate Office - ${userAddress}, ${userCity} - ${userPincode}</h3>
                </div>
                <div style="width: 35%; display: table-cell; vertical-align: middle; text-align: left;">
                    <h3 style="margin: 0;">
                        <span style="font-size: 16px; font-weight: 600;">${userCompany}</span>
                    </h3>
                    <h3 style="margin: 0; font-weight: 400; font-size: 14px;">GST No - 
                        <span style="font-weight: 600;">${userGst}</span>
                    </h3>
                    <h3 style="margin: 0; font-weight: 400; font-size: 12px;">User Id - <span>${userName}</span></h3>
                    <h3 style="margin: 0; font-weight: 400; font-size: 12px;">Address - ${userAddress}</h3>
                    <h3 style="font-weight: 600; font-size: 12px; margin: 0;">
                        support@Prakriti.one, +91 9117799755
                    </h3>
                </div>
            </div>
        </table>
        <table cellspacing="0" cellpadding="5" border="0" align="center" width="100%">
            <tbody>
                <tr>
                    <hr style="border: 1px solid #1E2757">
                </tr>
            </tbody>
        </table>
        <table cellspacing="0" cellpadding="5" border="0" align="center" width="100%">
            <tbody>
                <tr>
                    <td style="padding: 0;">
                        <div class="comp-part-one">
                            <ul style="margin: 0; padding: 0; list-style: none; display: flex; gap: 15px; justify-content: space-between;">
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Company -</span>
                                    <span style="font-weight: 600; font-size: 12px; margin: 0;">${userCompany}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">GST IN</span>
                                    <span style="font-weight: 600; font-size: 12px; margin: 0;">${userGst}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Contact -</span>
                                    <span style="font-weight: 600; font-size: 12px; margin: 0;">${userMobile}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Generated Date -</span>
                                    <span style="font-weight: 600; font-size: 12px; margin: 0;">${new Date().toLocaleDateString()}</span></li>
                            </ul>
                        </div>
                        <div class="comp-part-two" style="margin-top: 8px;">
                            <ul style="margin: 0; padding: 0; list-style: none; display: flex; gap: 15px; justify-content: space-between;">
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Address -</span>
                                    <span style="font-weight: 500; font-size: 12px; margin: 0;">${userAddress}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">City -</span>
                                    <span style="font-weight: 500; font-size: 12px; margin: 0;">${userCity}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Pin -</span>
                                    <span style="font-weight: 500; font-size: 12px; margin: 0;">${userPincode}</span></li>
                                <li><span style="font-weight: 400; font-size: 12px; margin: 0;">Total Products -</span>
                                  <span style="font-weight: 600; font-size: 12px; margin: 0;">${reportItems.length}</span></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    `;

    // Footer HTML matching purchase invoice format with terms and conditions
    let footerhtml = `
        <div class="invoice" style="width: 1000px; padding: 15px; margin: 0px; background-color: #f9f9f9;">
            <hr/>
            <table cellpadding="0" cellspacing="1" width="1000px" style="margin: auto;">
                <tbody>
                    <tr>
                        <td>
                            <table cellspacing="0" cellpadding="0" border="0" align="center" width="90%">
                                <div style="display: table; width: 100%; font-size: 11px;">
                                    <div style="display: table-cell; width: 65%;">
                                        <h5 style="margin: 0px; font-size: 11px; font-weight: 600; text-transform: uppercase;">NOTE</h5>
                                        <ul style="margin: 0; padding: 0px; list-style: none;">
                                            <span style="margin: 0; text-align: left; font-size: 11px; font-weight: 400;">* This is an auto-generated Current Stock Inventory Report</span>
                                            <li style="margin: 0; text-align: left; font-size: 11px; font-weight: 400; list-style-type: disc; margin-left: 35px;">Report generated on ${new Date().toLocaleString()}</li>
                                            <li style="margin: 0; text-align: left; font-size: 11px; font-weight: 400; list-style-type: disc; margin-left: 35px;">Prakriti Inventory Management System</li>
                                            <li style="margin: 0; text-align: left; font-size: 11px; font-weight: 400; list-style-type: disc; margin-left: 35px;">All disputes are subject to Patna Jurisdiction only</li>
                                            <li style="margin: 0; text-align: left; font-size: 11px; font-weight: 400; list-style-type: disc; margin-left: 35px;">For inquiries, contact: support@Prakriti.one</li>
                                        </ul>
                                    </div>
                                    <div style="display: table-cell; width: 35%;">
                                        <div style="margin-top: 5px">
                                            <p style="font-size: 11px; margin: 0; line-height: 1.2;"><strong>Company Name -</strong> ${userCompany}</p>
                                            <p style="font-size: 11px; margin: 0; line-height: 1.2;">${userCompany}, ${userCity}</p>
                                            <p style="font-size: 11px; margin: 0; line-height: 1.2;"><strong>GST -</strong> ${userGst}</p>
                                            <p style="font-size: 11px; margin: 0; line-height: 1.2;"><strong>Contact -</strong> ${userMobile}</p>
                                        </div>
                                    </div>
                                </div>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    let html = `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Current Stock Report</title>
            <style>html{-webkit-print-color-adjust:exact;} body{box-sizing:border-box;padding:0;margin:0;font-family:'Poppins',sans-serif;} .invoice{max-width:1000px;margin:auto;padding:15px;background-color:#f9f9f9;} table{width:100%;border-collapse:collapse;} th,td{font-size:11px} thead th{background:#1E2757;color:#fff;padding:6px} tbody tr{page-break-inside:avoid;} thead{display:table-header-group;} .table-footer-area{page-break-inside:avoid;}</style>
        </head>
        <body>
            <div class="invoice">
                ${headerhtml}
                </div>
            <div class="invoice" style="margin-top:20px;">`;

    // Single table with all products
    html += `<table cellspacing="0" cellpadding="5" border="0" align="center"><thead><tr>
      <th style="text-align:left;width:30px;">#</th>
      <th style="text-align:left;">Product Name</th>
      <th style="text-align:left;width:80px;">Qty(pcs)</th>
      <th style="text-align:left;">Material</th>
      <th style="text-align:left;width:100px;">Gross Wt</th>
      <th style="text-align:left;width:100px;">Price</th>
      </tr></thead><tbody>`;

    // Render all items from reportItems
    for (let i = 0; i < reportItems.length; i++) {
      const r = reportItems[i];
      let materialCell = '';
      let seenMaterials = new Set();
      const aggregatedMaterials = r.stock_materials ? aggregateMaterialDisplay(r.stock_materials) : [];
      if (aggregatedMaterials.length) {
        let mparts = [];
        for (let m of aggregatedMaterials) {
          const mName = m.material_name || m.material_id || 'Unknown';
          const w = Number(m.weight || m.quantity || 0) || 0;
          const unit = m.unit_name || '';
          mparts.push(`${mName} - ${weightFormat(w)} ${unit}`);

              const materialKey = (mName.toString().trim().toLowerCase() + "||" + (unit || "").toString().trim().toLowerCase());
          if (!materialTotals[materialKey]) {
            materialTotals[materialKey] = {
              name: mName,
              unit_name: unit,
              product_count: 0,
              total_product_qty: 0,
              total_product_weight: 0,
              total_material_weight: 0,
              total_price: 0,
            };
          }

          // accumulate material specific sums
          if (!seenMaterials.has(materialKey)) {
            materialTotals[materialKey].product_count += 1;
            materialTotals[materialKey].total_product_qty += Number(r.quantity || 0);
            materialTotals[materialKey].total_price += Number(r.mrp || 0);
            seenMaterials.add(materialKey);
          }
          materialTotals[materialKey].total_material_weight += Number(w || 0);
        }
        materialCell = mparts.join('<br>');
      }

      html += `<tr style="background-color:${i % 2 == 0 ? '#fff' : '#f2f2f2'}"><td style="padding:6px;">${i + 1}</td>
          <td style="padding:6px;">${r.name || ''}</td>
          <td style="padding:6px;">${r.quantity || 0}</td>
          <td style="padding:6px;">${materialCell}</td>
          <td style="padding:6px;">${r.total_weight_display || r.total_weight || 0}</td>
          <td style="padding:6px;">${r.mrp_display || displayAmount(r.mrp, false, true, true) || (displayAmount(0, false, true, true))}</td>
      </tr>`;
    }

    // Overall totals row with material-wise summary in Material column
    let materialSummary = '';
    if (materialTotals && Object.keys(materialTotals).length) {
      let matParts = [];
      for (let mn of Object.keys(materialTotals)) {
        const m = materialTotals[mn];
        const unitDisplay = m.unit_name ? ` ${m.unit_name}` : ' gm';
        matParts.push(`${m.name}: ${weightFormat(m.total_material_weight)}${unitDisplay}`);
      }
      materialSummary = matParts.join(' <br/> <br/> ');
    }

    html += `</tbody>
          <tr style="font-weight:600;background:#e9e9e9; padding-top:20px;">
            <td colspan="6" style="padding-top:50px;"></td>
          </tr>
          <tr style="font-weight:600;background:#e9e9e9; border-top: 1px solid #ccc;">
            <td colspan="2" style="padding:6px;">TOTAL</td>
            <td style="padding:6px;font-size:11px;">${overallTotals.total_qty}</td>
            <td style="padding:6px;font-size:11px;">${materialSummary}</td>
            <td style="padding:6px;font-size:11px;">${weightFormat(overallTotals.total_weight)+" gm"}</td>
            <td style="padding:6px;font-size:11px;">${displayAmount(overallTotals.total_value, false, true, true)}</td>
          </tr>
      </table><div style="height:12px"></div>`;

    // Add footer with company details
    html += footerhtml;

    html += `</div></body></html>`;

    const htmlPdf = require("html-pdf-node");
    const file = { content: html };
    const options = { format: "A4", margin: { top: "10mm", bottom: "10mm" } };

    try {
      const filename = `current-stock-report_${new Date().getTime()}.pdf`;
      const file_path = `public/reports/${filename}`;
      // ensure directory exists
      try {
        fs.mkdirSync("public/reports", { recursive: true });
      } catch (e) {
        addLog("currentStockReportPdf mkdir error: " + (e && e.message ? e.message : e));
      }

      try {
        const pdfBuffer = await htmlPdf.generatePdf(file, options);
        const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        fs.writeFileSync(file_path, buf);
        addLog(`currentStockReportPdf generated: ${file_path}`);
        return res.send(
          formatResponse(
            {
              file_name: filename,
              url: getFileAbsulatePathPDF(file_path),
              items: items,
              report_items: reportItems,
              groups: groups,
              material_totals: materialTotals,
              overall_totals: overallTotals,
            },
            "Current stock report"
          )
        );
      } catch (e) {
        addLog("currentStockReportPdf generation error: " + (e && e.message ? e.message : e));
        console.error("currentStockReportPdf generation error:", e);
        return res.status(errorCodes.default).send(formatErrorResponse("Failed to generate report"));
      }
    } catch (e) {
      addLog("currentStockReportPdf unexpected error: " + (e && e.message ? e.message : e));
      console.error("currentStockReportPdf unexpected error:", e);
      return res.status(errorCodes.default).send(formatErrorResponse("Failed to generate report"));
    }
  } catch (err) {
    addLog("currentStockReportPdf error: " + (err && err.message ? err.message : err));
    console.error("currentStockReportPdf error:", err);
    return res.status(errorCodes.default).send(formatErrorResponse("Failed to generate report"));
  }
};

/**
 * Retrieve all Unit
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  /**
   * Update all old stock material category_id
   */
  /*let allStocks = await stocksModel.findAll({
    include: [
      {
        model: productsModel,
        as: 'product',
        //required: true
      }
    ]
  });
  for(let i = 0; i < allStocks.length; i++){
    await stock_materialsModel.update({
      category_id: allStocks[i].product.category_id
    },{where: {stock_id: allStocks[i].id}});
  }*/

  /**
   * update stock material total gram which have null
   */
  /*let allStockMaterials = await stock_materialsModel.findAll({
    include: [
      {
        model: UnitModel,
        as: 'unit',
        required: true
      }
    ]
  });
  for(let i = 0; i < allStockMaterials.length; i++){
    let total_gram = convertUnitToGram(allStockMaterials[i].unit.name, allStockMaterials[i].weight);
    await stock_materialsModel.update({
      weight_in_gram: total_gram
    },{where: {id: allStockMaterials[i].id}});
  }*/

  let superAdminRoleId = getRoleId("superadmin");
    let adminRoleId = getRoleId("admin");
    let distributorRoleId = getRoleId("distributor");
    let retailerRoleId = getRoleId("retailer");
    let supplierRoleId = getRoleId("supplier");
    let customerRoleId = getRoleId("customer");
    let sales_executiveRoleId = getRoleId("sales_executive");
    let superAdminId = await getSuperAdminId();

  //update stock purity_id which product is material
  if (req.query.search == "update_all_stock_priority") {
    let stocksAll = await stocksModel.findAll({
      where: { type: { [Op.ne]: "material" } },
      include: [
        {
          model: productsModel,
          as: "product",
          required: true,
        },
        {
          model: stock_materialsModel,
          as: "stockMaterials",
          separate: true,
        },
      ],
    });

    for (let i = 0; i < stocksAll.length; i++) {
      // compactLog("---------stocksAll----------",stocksAll[i])
      let item = stocksAll[i];
      if (
        item.product.type == "material" &&
        item.stockMaterials.length &&
        isEmpty(item.purity_id)
      ) {
        await stocksModel.update(
          { purity_id: item.stockMaterials[0].purity_id },
          { where: { id: item.id } }
        );
      }
    }
  }

  try {
    let {
      page,
      limit,
      all,
      category_id,
      sub_category_id,
      search,
      qty,
      unit,
      pcode,
      size,
      price,
      user_id,
      material_id,
      type,
      own_distributor,
      own_admin,
      own_se,
      total_avl_stock,
      by_specific,
      manager,
      total_weight,
      certificate_no,
    } = req.query;
    type = type === undefined ? "product" : type;
    let userID = !user_id
      ? isManager(req)
        ? req.userId
        : await getWorkingUserID(req)
      : user_id;

    console.log("req.userId : ", req.userId);
    let userDtls = await UserModel.findByPk(req.userId);
    let role = await Role.findByPk(userDtls.role_id);
    console.log('role : ', role);
    let roleName = role ? role.name : "user";

    let conditions = { type: type };

    let superAdminRoleId = getRoleId("superadmin");
    let adminRoleId = getRoleId("admin");
    let distributorRoleId = getRoleId("distributor");
    let retailerRoleId = getRoleId("retailer");
    let supplierRoleId = getRoleId("supplier");
    let customerRoleId = getRoleId("customer");
    let sales_executiveRoleId = getRoleId("sales_executive");
    let seRoleId = getRoleId("sales_executive");
    if (isSuperAdmin(req)) {
      if (own_distributor == "1" || own_distributor == "0") {
        let thisCon = { role_id: distributorRoleId };
        if (own_distributor == "1") {
          thisCon.own = true;
        } else if (own_distributor == "0") {
          thisCon.own = false;
        }
        let distributors = await UserModel.findAll({
          attributes: ["id"],
          where: thisCon,
        });
        let distributorIds = arrayColumn(distributors, "id");
        conditions.user_id = { [Op.in]: distributorIds };
      } else if (own_admin == "1" || own_admin == "0") {
        let thisCon = { role_id: adminRoleId };
        if (own_admin == "1") {
          thisCon.own = true;
        } else if (own_admin == "0") {
          thisCon.own = false;
        }
        let admins = await UserModel.findAll({
          attributes: ["id"],
          where: thisCon,
        });
        let adminIds = arrayColumn(admins, "id");
        conditions.user_id = { [Op.in]: adminIds };
      } else if (total_avl_stock == 1) {
        let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
        //ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      } else if (manager == 1) {
        let managerUsers = await UserModel.findAll({
          attributes: ["id"],
          where: { role_id: getRoleId("manager") },
        });
        let managerUsersIds = arrayColumn(managerUsers, "id");
        conditions.user_id = { [Op.in]: managerUsersIds };
      } else if (own_se == 1) {
        let se_parent_ids = [];
        // all own admin
        let ownAdmins = await UserModel.findAll({
          attributes: ["id"],
          where: { role_id: adminRoleId, own: true, parent_id: superAdminId },
        });
        let ownAdminIds = arrayColumn(ownAdmins, "id");
        se_parent_ids = se_parent_ids.concat(ownAdminIds);
        // all own distributors
        let ownDistributorsOfAdmins = await UserModel.findAll({
          attributes: ["id"],
          where: {
            role_id: distributorRoleId,
            own: true,
            parent_id: { [Op.in]: ownAdminIds },
          },
        });
        let ownDistributorOfAdminsIds = arrayColumn(
          ownDistributorsOfAdmins,
          "id"
        );
        se_parent_ids = se_parent_ids.concat(ownDistributorOfAdminsIds);
        let ownDistributors = await UserModel.findAll({
          attributes: ["id"],
          where: {
            role_id: distributorRoleId,
            own: true,
            parent_id: superAdminId,
          },
        });
        let ownDistributorsIds = arrayColumn(ownDistributors, "id");
        se_parent_ids = se_parent_ids.concat(ownDistributorsIds);

        let se = await UserModel.findAll({
          attributes: ["id"],
          where: {
            role_id: sales_executiveRoleId,
            parent_id: { [Op.in]: se_parent_ids },
          },
        });
        let seIds = arrayColumn(se, "id");


        // let se = await UserModel.findAll({
        //   attributes: ["id"],
        //   where: { role_id: seRoleId },
        // });
        //let seIds = arrayColumn(se, "id");
        conditions.user_id = { [Op.in]: seIds };
      }
    } else if (isAdmin(req)) {
      if (own_distributor == "1" || own_distributor == "0") {
        let state_id = await getUserColumnValue(req.userId, "state_id");
        let thisCon = { role_id: distributorRoleId, state_id: state_id };
        if (own_distributor == "1") {
          thisCon.own = true;
        } else if (own_distributor == "0") {
          thisCon.own = false;
        }
        let distributors = await UserModel.findAll({
          attributes: ["id"],
          where: thisCon,
        });
        let distributorIds = arrayColumn(distributors, "id");
        conditions.user_id = { [Op.in]: distributorIds };
      } else if (by_specific == 1 && total_avl_stock == 1) {
        let ownUserIds = await avlStockUserIdsNew(req, adminRoleId);
        ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      } else if (by_specific == 1 && own_se == 1) {
        let seData = await UserModel.findAll({
          attributes: ["id"],
          where: { role_id: seRoleId, parent_id: userID },
        });
        let seIds = arrayColumn(seData, "id");
        conditions.user_id = { [Op.in]: seIds };
      } else if (total_avl_stock == 1) {
        let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
        //ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      }
    } else if (isDistributor(req)) {
      if (own_se == 1) {
        let seData = await UserModel.findAll({
          attributes: ["id"],
          where: { role_id: seRoleId, parent_id: req.userId },
        });
        let seIds = arrayColumn(seData, "id");
        conditions.user_id = { [Op.in]: seIds };
      } else if (by_specific == 1 && total_avl_stock == 1) {
        let admin_id = await getUserColumnValue(req.userId, "parent_id");
        //let ownUserIds = await avlStockUserIdsNew(req, distributorRoleId);
        let ownUserIds = await avlStockUserIdsNew(
          { userId: admin_id, role: adminRoleId },
          adminRoleId
        );
        ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      } else if (total_avl_stock == 1) {
        let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
        ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      }
    } else if (isSalesExecutive(req)) {
      if (by_specific == 1 && total_avl_stock == 1) {
        let distributor_id = await getUserColumnValue(req.userId, "parent_id");
        let distributorRole = await getUserColumnValue(distributor_id, "role_id");
        let admin_id = null;
        if(distributorRole == adminRoleId){
          admin_id = distributor_id;
        } else {
          admin_id = await getUserColumnValue(distributor_id, "parent_id");
        }
        //let ownUserIds = await avlStockUserIdsNew(req, sales_executiveRoleId);
        let ownUserIds = await avlStockUserIdsNew(
          { userId: admin_id, role: adminRoleId },
          adminRoleId
        );
        //ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      } else if (total_avl_stock == 1) {
        let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
        //ownUserIds.push(userID);
        conditions.user_id = { [Op.in]: ownUserIds };
      }
    }
    if (!("user_id" in conditions)) {
      conditions.user_id = await getStockUserID(req, userID);
    }
    let productConditions = {};
    let stockMaterialConditions = {};
    let sizeConditions = {};
    if (!isEmpty(category_id)) {
      productConditions.category_id = category_id;
    }
    if (!isEmpty(sub_category_id)) {
      productConditions.sub_category_id = sub_category_id;
    }
    /*if (!isEmpty(pcode)) {
      productConditions.product_code = pcode;
    }*/

    let sCond = [];
    if (!isEmpty(search)) {
      let sArr = String(search).split(",");
      for (let i = 0; i < sArr.length; i++) {
        let s = sArr[i].trim();
        if (s === "") continue;
        // Text search across name / certificate_no / product code.
        // NOTE: certificate numbers can be fully numeric (e.g. "042200272409"),
        // so we must NOT treat a numeric token as an `mrp` filter here. There is
        // no `mrp` column on the stocks table, so the old numeric branch threw
        // "Unknown column 'mrp'" and made every all-numeric certificate
        // un-searchable (the query errored and the UI showed "No data found").
        // Price narrowing, when applicable, still happens in post-processing
        // below using the computed item.mrp.
        const sl = s.toLowerCase();
        if (type == "product" || type == "return") {
          sCond.push({ "$product.name$": { [Op.like]: `%${sl}%` } });
          sCond.push({ certificate_no: sl });
          sCond.push({ "$product.product_code$": { [Op.like]: `%${sl}%` } });
        } else {
          sCond.push({ "$material.name$": { [Op.like]: `%${sl}%` } });
          sCond.push({ "$purity.name$": { [Op.like]: `%${sl}%` } });
        }
      }
      if (sCond.length) {
        conditions = { ...conditions, [Op.or]: sCond };
      }
    }
    /* if(search.length>=8) {
      let sArr = search.split(",");
      
      for (let i = 0; i < sArr.length; i++) {
        
        let s = sArr[i].trim().toLowerCase();
       
        if (s.indexOf("gm") !== -1) {
          s = s.replace("gm", "").trim();
          sCond.push({ total_weight: { [Op.lte]: `${s}` } });
          conditions = { ...conditions, [Op.or]: [{ 'total_weight': { [Op.lte]: `${s}` } }] };
        } else if (s) {
          if (type == "product" || type == "return") {
            sCond.push({ "$product.name$": { [Op.like]: `%${s}%` } });
            sCond.push({ certificate_no: s });
            sCond.push({ "$product.product_code$": { [Op.like]: `%${s}%` } });
            conditions = { ...conditions, [Op.or]: [{ '$product.name$': { [Op.like]: `%${s}%` } }, { certificate_no: s }, { '$product.product_code$': { [Op.like]: `%${s}%` } }] };
          } else {
            sCond.push({ "$material.name$": { [Op.like]: `%${s}%` } });
            sCond.push({ "$purity.name$": { [Op.like]: `%${s}%` } });
            conditions = { ...conditions, [Op.or]: [{ '$material.name$': { [Op.like]: `%${s}%` } }] };
          }
        }
      }
      
      conditions = { ...conditions, [Op.or]: sCond };
    } */
    

    if(typeof material_id != "undefined" && material_id != null && material_id != "") {
      conditions.material_id = material_id;
    }

    /* prefix match so "3.3" finds 3.310, "3.310" finds exactly that weight */
    if (!isEmpty(total_weight)) {
      conditions.total_weight = { [Op.like]: `${String(total_weight).trim()}%` };
    }

    if (!isEmpty(certificate_no)) {
      conditions.certificate_no = String(certificate_no).trim();
    }

    /*if (!isEmpty(qty)) {
      stockMaterialConditions.quantity = qty;
    }

    if (!isEmpty(unit)) {
      stockMaterialConditions.unit_id = unit;
    }

    if (!isEmpty(size)) {
      sizeConditions.id = size;
    }*/
    compactLog("STOCK LIST conditions:", conditions);
    const paginatorOptions = getPaginationOptions(page, limit);
    let limit_offset = {
      offset: paginatorOptions.offset,
      limit: paginatorOptions.limit,
    };
    if (all == 1) {
      limit_offset = {};
    }
    let _include = [
      {
        model: stock_materialsModel,
        as: "stockMaterials",
        required: true,
        where: stockMaterialConditions,
        //separate: true,
        include: [
          {
            model: materialModel,
            as: "material",
          },
          {
            model: UnitModel,
            as: "unit",
          },
          {
            model: PurityModel,
            as: "purity",
          },
        ],
      },
      {
        model: UserModel,
        as: "user",
      },
      
      {
        model: PurityModel,
        as: 'spurity',
        required: false,
      }
        
    ];
    if (type == "product" || type == "return") {
      _include.push({
        model: sizesModel,
        as: "size",
        where: sizeConditions,
        required: false
      });
      _include.push({
        model: productsModel,
        as: "product",
        required: true,
        where: productConditions,
        include: [
          {
            model: CategoryModel,
            as: "category",
          },
          {
            model: SubCategoryModel,
            as: "sub_category",
          },
          {
            model: CertificateModel,
            as: "certificates",
          },
          {
            model: TaxSlabModel,
            as: "tax",
          },
        ],
      });
    } else {
      _include.push({
        model: materialModel,
        as: "material",
        required: true,
        where: productConditions,
        include: [
          {
            model: CategoryModel,
            as: "category",
          },
          {
            model: PurityModel,
            as: 'purities',
          }
        ],
      });
    }
    compactLog("_include length:", Array.isArray(_include) ? _include.length : typeof _include);
    compactLog("conditions keys:", conditions && typeof conditions === 'object' ? Object.keys(conditions).length : typeof conditions);
    /* list should not show sale on approval stocks */
    
    /* get all sale on approval sale ids by user */
    // const sales = await SaleModel.findAll({
    //   attributes: ["id"],
    //   where: { 
    //     is_approval: "1",
    //     sale_by: userID,
    //     is_approved: "3"
    //   }
    // });
    // let saleIds = arrayColumn(sales, "id");
    // compactLog("saleIds : =======================================>", saleIds);
    // /* get all sale on approval sale products certificates by user */
    // const saleProducts = await SaleProductModel.findAll({
    //   attributes: ["certificate_no"],
    //   where: { 
    //     sale_id: { [Op.in]: saleIds }, 
    //   },
    // });
    // let certidicates = arrayColumn(saleProducts, "certificate_no");
    // compactLog("certidicates : ====================================>", certidicates);
    stocksModel
      .findAndCountAll({
        order: [["id", "DESC"]],
        where: {
          ...conditions,
          //certificate_no: { [Op.notIn]: certidicates }, 
        },
        ...limit_offset,
        include: _include,
        distinct: true,
        //subQuery: isEmpty(search) ? true : false,
      })
      .then(async (data) => {
        //
        compactLog("stocks result rows:", Array.isArray(data.rows) ? data.rows.length : typeof data.rows);
        //return false;
        let result = {
          items:
            type == "product" || type == "return"
              ? await StocksReportCollection(data.rows, userID, roleName)
              : await StocksMaterialReportCollection(data.rows, userID, roleName),
          total: data.count,
        };
        /* compactLog("result : ", result);
        compactLog("search : ", search); */
        //if(!isNaN(search) && search != ""){
        let sArr = search.split(",");
        for (let i = 0; i < sArr.length; i++) {
          let s = sArr[i].trim().toLowerCase();
          /* price search */
          if (!isNaN(s) && s != "") {
            /* compactLog("price search ..."); */
            search = parseFloat(s.trim());
            /* compactLog("search : ", s); */
            //compactLog(result.items);
            let fItems = result.items.filter((itm) => {
              /* compactLog(itm.mrp); */
              return itm.mrp <= s;
            });

            result.items = fItems;
            result.total = fItems.length;
          }
        }
        //}

        // compactLog(result)
        // compactLog("--------------------",result,"---------------------")
        res.send(formatResponse(result, "stocks super_admin"));
      })
      .catch((err) => {
        addLog("catch error: " + err.toString());
        console.error('stocks.find error:', err && err.message ? err.message : err);
        res.status(errorCodes.default).send(formatErrorResponse(err));
      });
  } catch (error) {
    addLog("error: " + error.toString());
  }
};

/**
 * View Stock
 *.
 * @param {*} req
 * @param {*} res
 */
exports.view = async (req, res) => {
  let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
  console.log("req.userId : ", req.userId);
  let userDtls = await UserModel.findByPk(req.userId);
  let role = await Role.findByPk(userDtls.role_id);
  console.log('role : ', role);
  let roleName = role ? role.name : "user";

  let stock = await stocksModel.findOne({
    where: { user_id: await getStockUserID(req, userID), id: req.params.id },
    include: [
      {
        model: productsModel,
        as: "product",
        include: [
          {
            model: CategoryModel,
            as: "category",
          },
          {
            model: SubCategoryModel,
            as: "sub_category",
          },
          {
            model: CertificateModel,
            as: "certificates",
          },
        ],
      },
      {
        model: sizesModel,
        as: "size",
      },
      {
        model: stock_materialsModel,
        as: "stockMaterials",
        separate: true,
        include: [
          {
            model: materialModel,
            as: "material",
          },
          {
            model: UnitModel,
            as: "unit",
          },
          {
            model: PurityModel,
            as: "purity",
          },
        ],
      },
    ],
  });

  if (!stock) {
    return res
      .status(errorCodes.default)
      .send(formatErrorResponse("Stock not found"));
  }
  res.send(
    formatResponse(await StocksReportCollection(stock, userID, roleName), "Stock details")
  );
};

/**
 * Retrieve all products for sale
 * @param req
 * @param res
 */
exports.stockProducts = async (req, res) => {
  let { sub_category_id } = req.query;
  if (isEmpty(sub_category_id)) {
    return res.send(formatResponse([], "Stock Products"));
  }
  let userID = await getStockUserID(req);
  let stocks = await stocksModel.findAll({
    where: { user_id: userID },
    group: ["product_id"],
    include: [
      {
        model: productsModel,
        as: "product",
        where: { sub_category_id: sub_category_id },
        include: [
          {
            model: TaxSlabModel,
            as: "tax",
          },
        ],
      },
    ],
  });
  let products = [];
  for (let i = 0; i < stocks.length; i++) {
    let stock = stocks[i];
    if (!isEmpty(stock.product)) {
      let taxInfo = null;
      if ("tax" in stock.product && stock.product.tax) {
        taxInfo = {
          name: stock.product.tax.name,
          cgst: parseFloat(stock.product.tax.cgst),
          sgst: parseFloat(stock.product.tax.sgst),
          igst: parseFloat(stock.product.tax.igst),
        };
      }

      products.push({
        name: stock.product.name,
        id: stock.product.id,
        type: stock.product.type,
        tax_info: taxInfo,
      });
    }
  }

  res.send(formatResponse(products, "Stock Products"));
};

/**
 * Retrieve stock product details
 * @param req
 * @param res
 */
exports.stockProductDetails = async (req, res) => {
  let userID = await getStockUserID(req);
  let stocks = await stocksModel.findAll({
    where: { user_id: userID, product_id: req.query.product_id },
    include: [
      {
        model: productsModel,
        as: "product",
      },
      {
        model: sizesModel,
        as: "size",
      },
      {
        model: stock_materialsModel,
        as: "stockMaterials",
        separate: true,
        include: [
          {
            model: materialModel,
            as: "material",
          },
          {
            model: UnitModel,
            as: "unit",
          },
          {
            model: PurityModel,
            as: "purity",
          },
        ],
      },
    ],
  });

  let products = [];
  for (let i = 0; i < stocks.length; i++) {
    let stock = stocks[i];
    if (!isEmpty(stock.product)) {
      let thisObj = {
        stock_id: stock.id,
        product_name: stock.product.name,
        product_type: stock.product.type,
        product_id: stock.product.id,
        size_id: stock.size_id,
        size_name: stock.size ? stock.size.name : "",
        certificate_no: stock.certificate_no,
      };
      let materials = [];
      for (let x = 0; x < stock.stockMaterials.length; x++) {
        let stockM = stock.stockMaterials[x];
        let thisMObj = {
          material_id: stockM.material_id,
          weight: stockM.weight,
          quantity: stockM.quantity,
          material_name: stockM.material ? stockM.material.name : "",
          unit_id: stockM.unit_id,
          unit_name: stockM.unit ? stockM.unit.name : "",
          purity: stockM.purity ? stockM.purity.name : "",
          purity_id: stockM.purity_id,
        };
        materials.push(thisMObj);
      }
      thisObj.materials = materials;
      products.push(thisObj);
    }
  }

  res.send(formatResponse(products, "Stock product details"));
};

/**
 * Check duplicate certidicate no
 * @param req
 * @param res
 */
exports.checkDuplicateCertificateNo = async (req, res) => {
  let data = req.body;
  if (isEmpty(data.certificate_no)) {
    return res.send(formatResponse({ is_exist: false }));
  }

  let stock = await stocksModel.findOne({
    where: { certificate_no: data.certificate_no },
  });
  let is_exist = stock ? true : false;
  let purchaseProduct = await PurchaseProductModel.findOne({
    where: { certificate_no: data.certificate_no },
    include: [
      {
        model: PurchaseModel,
        as: "purchase",
        required: true,
        where: { is_approved: { [Op.ne]: 2 } },
      },
    ],
  });
  is_exist = purchaseProduct ? true : is_exist;

  return res.send(formatResponse({ is_exist: is_exist }));
};

/**
 * Get category wise stock amount
 * @param req
 * @param res
 */
exports.getStockPriceByCategory = async (req, res) => {
  let {
    user_id,
    type,
    by_specific,
    own_distributor,
    own_admin,
    own_se,
    total_avl_stock,
    manager,
  } = req.query;

  console.log("req.userId : ", req.userId);
  let userDtls = await UserModel.findByPk(req.userId);
  let role = await Role.findByPk(userDtls.role_id);
  console.log('role : ', role);
  let roleName = role ? role.name : "user";

  compactLog("by_specific : ", by_specific);
  type = isEmpty(type) ? "product" : type;
  let userID = null;
  if (!isEmpty(user_id)) {
    userID = user_id;
  }
  userID = !userID
    ? isManager(req)
      ? req.userId
      : await getWorkingUserID(req)
    : userID;
  let userIdArr = [];
  let superAdminRoleId = getRoleId("superadmin");
  let adminRoleId = getRoleId("admin");
  let distributorRoleId = getRoleId("distributor");
  let bySpecific = false;
  if (isSuperAdmin(req)) {
    if (own_distributor == "1" || own_distributor == "0") {
      let thisCon = { role_id: distributorRoleId };
      if (own_distributor == "1") {
        thisCon.own = true;
      } else if (own_distributor == "0") {
        thisCon.own = false;
      }
      let distributors = await UserModel.findAll({
        attributes: ["id"],
        where: thisCon,
      });
      userIdArr = arrayColumn(distributors, "id");
      bySpecific = true;
    } else if (own_admin == "1" || own_admin == "0") {
      let thisCon = { role_id: adminRoleId };
      if (own_admin == "1") {
        thisCon.own = true;
      } else if (own_admin == "0") {
        thisCon.own = false;
      }
      let admins = await UserModel.findAll({
        attributes: ["id"],
        where: thisCon,
      });
      userIdArr = arrayColumn(admins, "id");
      bySpecific = true;
    } else if (total_avl_stock == 1) {
      let ownUserIds = await avlStockUserIdsNew(req);
      //ownUserIds.push(userID);
      userIdArr = ownUserIds;
      bySpecific = true;
    } else if (manager == 1) {
      let managerUsers = await UserModel.findAll({
        attributes: ["id"],
        where: { role_id: getRoleId("manager") },
      });
      let managerUsersIds = arrayColumn(managerUsers, "id");
      userIdArr = managerUsersIds;
      bySpecific = true;
    } else if (own_se == 1) {
      let se = await UserModel.findAll({
        attributes: ["id"],
        where: { role_id: getRoleId("sales_executive") },
      });
      let seIds = arrayColumn(se, "id");
      userIdArr = seIds;
      bySpecific = true;
    }
  } else if (isAdmin(req)) {
    if (own_distributor == "1" || own_distributor == "0") {
      let state_id = await getUserColumnValue(req.userId, "state_id");
      let thisCon = { role_id: distributorRoleId, state_id: state_id };
      if (own_distributor == "1") {
        thisCon.own = true;
      } else if (own_distributor == "0") {
        thisCon.own = false;
      }
      let distributors = await UserModel.findAll({
        attributes: ["id"],
        where: thisCon,
      });
      userIdArr = arrayColumn(distributors, "id");
      bySpecific = true;
    } else if(by_specific === "0"){ 
      let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
      userIdArr = ownUserIds;
      bySpecific = true;
    } else if (total_avl_stock == 1) {
      let ownUserIds = await avlStockUserIdsNew(req, adminRoleId);
      ownUserIds.push(userID);
      userIdArr = ownUserIds;
      bySpecific = true;
    } else if (by_specific == 1 && own_se == 1) {
      let seData = await UserModel.findAll({
        attributes: ["id"],
        where: { role_id: getRoleId("sales_executive"), parent_id: userID },
      });
      let seIds = arrayColumn(seData, "id");
      userIdArr = seIds;
      bySpecific = true;
    }
  } else if (isSalesExecutive(req)) {
    if(total_avl_stock == 1 && own_admin == 1){
      let distributor_id = await getUserColumnValue(req.userId, "parent_id");
      let distributorRole = await getUserColumnValue(distributor_id, "role_id");
      let admin_id = null;
      if(distributorRole == adminRoleId){
        admin_id = distributor_id;
      } else {
        admin_id = await getUserColumnValue(distributor_id, "parent_id");
      }
      /* let thisCon = { role_id: adminRoleId, id: admin_id };
      let admins = await UserModel.findAll({
        attributes: ["id"],
        where: thisCon,
      }); */
      const stockUserIds = await avlStockUserIdsNew(
        { userId: admin_id, role: adminRoleId },
        adminRoleId
      );
  
      userIdArr = stockUserIds;
      bySpecific = true;
    } else if(by_specific === "0"){ 
      let ownUserIds = await avlStockUserIdsNew(req, superAdminRoleId);
      userIdArr = ownUserIds;
      bySpecific = true;
    } else if (total_avl_stock == 1) {
      let ownUserIds = await avlStockUserIdsNew(req);
      ownUserIds.push(userID);
      userIdArr = ownUserIds;
      bySpecific = true;
    }
  } else if (isDistributor(req)) {
    if (total_avl_stock == 1) {
      let ownUserIds = await avlStockUserIdsNew(req);
      userIdArr = ownUserIds;
      bySpecific = true;
    } else if (own_se == 1) {
      let seData = await UserModel.findAll({
        attributes: ["id"],
        where: { role_id: getRoleId("sales_executive"), parent_id: req.userId },
      });
      let seIds = arrayColumn(seData, "id");
      userIdArr = seIds;
      bySpecific = true;
    }
  }
  if (!bySpecific) {
    userIdArr = [userID];
  }

  let result = await getTotalStockPriceByUser(true, userIdArr, type, roleName);

  return res.send(formatResponse(result));
};

/**
 * Move to stock
 *
 * @param {*} req
 * @param {*} res
 */
exports.moveToStock = async (req, res) => {
  let data = req.body;
  let stocks = await stocksModel.findAll({
    where: { id: { [Op.in]: data.stock_ids } },
    include: [
      {
        model: stock_materialsModel,
        as: "stockMaterials",
        required: true,
        separate: true,
        include: [
          {
            model: materialModel,
            as: "material",
          },
          {
            model: UnitModel,
            as: "unit",
          },
        ],
      },
    ],
  });
  for (let i = 0; i < stocks.length; i++) {
    let thisItem = stocks[i];
    let product = await productsModel.findByPk(thisItem.product_id);
    if (product) {
      if (product.type != "material") {
        await stocksModel.update(
          { type: "product" },
          { where: { id: thisItem.id } }
        );
      } else {
        let quantity = 0,
          weight_in_gram = 0;
        for (let x = 0; x < thisItem.stockMaterials.length; x++) {
          quantity += thisItem.stockMaterials[x].quantity
            ? parseInt(thisItem.stockMaterials[x].quantity)
            : 0;
          weight_in_gram += thisItem.stockMaterials[x].weight_in_gram
            ? parseInt(thisItem.stockMaterials[x].weight_in_gram)
            : 0;
        }

        let result = await updateOrCreate(
          stocksModel,
          {
            user_id: req.userId,
            type: "product",
            product_id: thisItem.product_id,
          },
          {
            quantity: quantity,
            total_weight: weight_in_gram,
            user_id: req.userId,
            type: "product",
            product_id: thisItem.product_id,
          },
          null,
          ["quantity", "total_weight"]
        );
        let stock = result.item;

        let stockMaterial = await stock_materialsModel.findOne({
          where: {
            stock_id: stock.id,
            material_id: thisItem.stockMaterials[x].material_id,
          },
        });
        if (stockMaterial) {
          let thisquantity = thisItem.stockMaterials[x].quantity
            ? parseInt(stockMaterial.quantity) +
              parseInt(thisItem.stockMaterials[x].quantity)
            : stockMaterial.quantity;
          await stock_materialsModel.update(
            {
              weight: weightFormat(
                parseFloat(stockMaterial.weight) +
                  weightFormat(thisItem.stockMaterials[x].weight)
              ),
              weight_in_gram: weightFormat(
                parseFloat(stockMaterial.weight_in_gram) +
                  weightFormat(thisItem.stockMaterials[x].weight_in_gram)
              ),
              quantity: thisquantity,
              purity_id: thisItem.stockMaterials[x].purity_id,
              unit_id: thisItem.stockMaterials[x].unit_id,
              category_id: category_id,
            },
            { where: { id: stockMaterial.id } }
          );
        } else {
          await stock_materialsModel.create({
            stock_id: stock.id,
            material_id: thisItem.stockMaterials[x].material_id,
            weight: weightFormat(thisItem.stockMaterials[x].weight),
            weight_in_gram: weightFormat(
              thisItem.stockMaterials[x].weight_in_gram
            ),
            quantity: thisItem.stockMaterials[x].quantity || 0,
            purity_id: thisItem.stockMaterials[x].purity_id,
            unit_id: thisItem.stockMaterials[x].unit_id,
            category_id: category_id,
          });
        }
      }
    }
  }

  res.send(formatResponse("", "Moved to stock successfully."));
};

/**
 * Update stock image by certificate number
 *
 * @param {*} req
 * @param {*} res
 */
exports.updateImage = async (req, res) => {
  try {
    let data = req.body;

    console.log("req.userId : ", req.userId);
    let userDtls = await UserModel.findByPk(req.userId);
    let role = await Role.findByPk(userDtls.role_id);
    console.log('role : ', role);
    let roleName = role ? role.name : "user";
    
    // Validate certificate_no
    if (isEmpty(data.certificate_no)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Certificate number is required"));
    }

    // Validate image
    if (isEmpty(data.image)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Image is required"));
    }

    // Find stock by certificate_no
    let stock = await stocksModel.findOne({
      where: { certificate_no: data.certificate_no },
    });

    if (!stock) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Stock not found with the given certificate number"));
    }

    // Remove old image if exists
    if (!isEmpty(stock.current_image)) {
      removeFile(stock.current_image);
    }

    // Upload new image
    let imageResult = await base64FileUpload(data.image, "products");
    
    if (!imageResult) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Failed to upload image"));
    }

    // Update stock with new image
    await stocksModel.update(
      { current_image: imageResult.path },
      { where: { id: stock.id } }
    );

    // Update all PurchaseProduct records with the same certificate_no
    await PurchaseProductModel.update(
      { current_image: imageResult.path },
      { where: { certificate_no: data.certificate_no } }
    );

    // Fetch updated stock
    let updatedStock = await stocksModel.findOne({
      where: { id: stock.id },
      include: [
        {
          model: productsModel,
          as: "product",
          include: [
            {
              model: CategoryModel,
              as: "category",
            },
            {
              model: SubCategoryModel,
              as: "sub_category",
            },
            {
              model: TaxSlabModel,
              as: "tax",
            },
            {
              model: CertificateModel,
              as: "certificates",
            },
          ],
        },
        {
          model: sizesModel,
          as: "size",
        },
        {
          model: stock_materialsModel,
          as: "stockMaterials",
          separate: true,
          include: [
            {
              model: materialModel,
              as: "material",
            },
            {
              model: UnitModel,
              as: "unit",
            },
            {
              model: PurityModel,
              as: "purity",
            },
          ],
        },
        {
          model: UserModel,
          as: "user",
        },
      ],
    });

    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    
    res.send(
      formatResponse(
        await StocksReportCollection(updatedStock, userID, roleName),
        "Stock image updated successfully!"
      )
    );
  } catch (error) {
    addLog("error: " + error.toString());
    console.error("Error updating stock image:", error);
    res
      .status(errorCodes.default)
      .send(formatErrorResponse("Failed to update stock image: " + error.message));
  }
};

/**
 * Update stock image by certificate number (from URL parameter)
 *
 * @param {*} req
 * @param {*} res
 */
exports.updateImageByCertificateNo = async (req, res) => {
  try {
    let data = req.body;

    console.log("req.userId : ", req.userId);
    let userDtls = await UserModel.findByPk(req.userId);
    let role = await Role.findByPk(userDtls.role_id);
    console.log('role : ', role);
    let roleName = role ? role.name : "user";

    let certificate_no = req.params.certificate_no;
    
    // Validate certificate_no from URL parameter
    if (isEmpty(certificate_no)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Certificate number is required"));
    }

    // Validate image
    if (isEmpty(data.image)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Image is required"));
    }

    // Find stock by certificate_no
    let stock = await stocksModel.findOne({
      where: { certificate_no: certificate_no },
    });

    if (!stock) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Stock not found with the given certificate number"));
    }

    // Remove old image if exists
    if (!isEmpty(stock.current_image)) {
      removeFile(stock.current_image);
    }

    // Upload new image
    let imageResult = await base64FileUpload(data.image, "products");
    
    if (!imageResult) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Failed to upload image"));
    }

    // Update stock with new image
    await stocksModel.update(
      { current_image: imageResult.path },
      { where: { id: stock.id } }
    );

    // Update all PurchaseProduct records with the same certificate_no
    await PurchaseProductModel.update(
      { current_image: imageResult.path },
      { where: { certificate_no: certificate_no } }
    );

    // Fetch updated stock
    let updatedStock = await stocksModel.findOne({
      where: { id: stock.id },
      include: [
        {
          model: productsModel,
          as: "product",
          include: [
            {
              model: CategoryModel,
              as: "category",
            },
            {
              model: SubCategoryModel,
              as: "sub_category",
            },
            {
              model: TaxSlabModel,
              as: "tax",
            },
            {
              model: CertificateModel,
              as: "certificates",
            },
          ],
        },
        {
          model: sizesModel,
          as: "size",
        },
        {
          model: stock_materialsModel,
          as: "stockMaterials",
          separate: true,
          include: [
            {
              model: materialModel,
              as: "material",
            },
            {
              model: UnitModel,
              as: "unit",
            },
            {
              model: PurityModel,
              as: "purity",
            },
          ],
        },
        {
          model: UserModel,
          as: "user",
        },
      ],
    });

    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    
    res.send(
      formatResponse(
        await StocksReportCollection(updatedStock, userID, roleName),
        "Stock image updated successfully!"
      )
    );
  } catch (error) {
    addLog("error: " + error.toString());
    console.error("Error updating stock image:", error);
    res
      .status(errorCodes.default)
      .send(formatErrorResponse("Failed to update stock image: " + error.message));
  }
};

/**
 * Update stock image by stock ID (from URL parameter)
 *
 * @param {*} req
 * @param {*} res
 */
exports.updateImageById = async (req, res) => {
  try {
    let data = req.body;
    let stockId = req.params.id;

    console.log("req.userId : ", req.userId);
    let userDtls = await UserModel.findByPk(req.userId);
    let role = await Role.findByPk(userDtls.role_id);
    console.log('role : ', role);
    let roleName = role ? role.name : "user";
    
    // Validate stock ID from URL parameter
    if (isEmpty(stockId)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Stock ID is required"));
    }

    // Validate image
    if (isEmpty(data.image)) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Image is required"));
    }

    // Find stock by ID
    let stock = await stocksModel.findOne({
      where: { id: stockId },
    });

    if (!stock) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Stock not found with the given ID"));
    }

    // Remove old image if exists
    if (!isEmpty(stock.current_image)) {
      removeFile(stock.current_image);
    }

    // Upload new image
    let imageResult = await base64FileUpload(data.image, "products");
    
    if (!imageResult) {
      return res
        .status(errorCodes.default)
        .send(formatErrorResponse("Failed to upload image"));
    }

    // Update stock with new image
    await stocksModel.update(
      { current_image: imageResult.path },
      { where: { id: stock.id } }
    );

    // Update all PurchaseProduct records with the same certificate_no
    if (stock.certificate_no) {
      await PurchaseProductModel.update(
        { current_image: imageResult.path },
        { where: { certificate_no: stock.certificate_no } }
      );
    }

    // Fetch updated stock
    let updatedStock = await stocksModel.findOne({
      where: { id: stock.id },
      include: [
        {
          model: productsModel,
          as: "product",
          include: [
            {
              model: CategoryModel,
              as: "category",
            },
            {
              model: SubCategoryModel,
              as: "sub_category",
            },
            {
              model: TaxSlabModel,
              as: "tax",
            },
            {
              model: CertificateModel,
              as: "certificates",
            },
          ],
        },
        {
          model: sizesModel,
          as: "size",
        },
        {
          model: stock_materialsModel,
          as: "stockMaterials",
          separate: true,
          include: [
            {
              model: materialModel,
              as: "material",
            },
            {
              model: UnitModel,
              as: "unit",
            },
            {
              model: PurityModel,
              as: "purity",
            },
          ],
        },
        {
          model: UserModel,
          as: "user",
        },
      ],
    });

    let userID = isManager(req) ? req.userId : await getWorkingUserID(req);
    
    res.send(
      formatResponse(
        await StocksReportCollection(updatedStock, userID, roleName),
        "Stock image updated successfully!"
      )
    );
  } catch (error) {
    addLog("error: " + error.toString());
    console.error("Error updating stock image:", error);
    res
      .status(errorCodes.default)
      .send(formatErrorResponse("Failed to update stock image: " + error.message));
  }
};
