const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { formatDateTime, isEmpty } = require("@helpers/helper");
const {getWorkingUserID} = require("@library/common");
const SaleProductModel = db.sale_products;
const PurchaseProductModel = db.purchase_products;
const SaleModel = db.sales;
const PurchaseModel = db.purchases;
const ProductModel = db.products;
const UserModel = db.users;
const ReturnModel = db.returns;
const ReturnProductModel = db.return_products;

/**
 * Search
 * 
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { search } = req.query;
  if(isEmpty(search)){
    return res.send(formatResponse({items: [], total: 0}, 'Search results.'));
  }

  //let userID = await getWorkingUserID(req);
  let items = [];

  //search from sale
  let sales = await SaleModel.findAll({
    order:[['id', 'DESC']],
    where: {[Op.or]: [{'$saleProducts.product.product_code$': search}, {'$saleProducts.certificate_no$': search}]},
    include: [
      {
        model: SaleProductModel,
        as: 'saleProducts',
        required: true,
        include: [
          {
            model: ProductModel,
            as: 'product',
            required: true
          }
        ]
      },
      {
        model: UserModel,
        as: 'user',
      },
      {
        model: UserModel,
        as: 'saleBy',
      }
    ]
  });
  for(let i = 0; i < sales.length; i++){
    let item = sales[i];
    let saleP = await SaleProductModel.findOne({where: {sale_id: item.id, [Op.or]: [{'$product.product_code$': search}, {certificate_no: search}]}, include: [
      {
        model: ProductModel,
        as: 'product',
        required: true
      }
    ]});
    let product_id = 0;
    if(saleP){
      product_id = saleP.product_id;
    }


    let thisObj = {
      id: item.id,
      invoice_number: item.invoice_number,
      invoice_date: formatDateTime(item.invoice_date, 8),
      main_invoice_date: item.invoice_date,
      sender_name: item.saleBy ? item.saleBy.name : '',
      sender_mobile: item.saleBy ? item.saleBy.mobile : '',
      receiver_name: item.user ? item.user.name : '',
      receiver_mobile: item.user ? item.user.mobile : '',
      type: item.is_assigned ? 'transfer' : 'sale',
      type_display: item.is_assigned ? 'Transfer' : 'Sale',
      product_id: product_id
    }
    items.push(thisObj);
  }

  //search from purchase
  let purchases = await PurchaseModel.findAll({
    where: {sale_id: {[Op.is]: null}, [Op.or]: [{'$purchaseProducts.product.product_code$': search}, {'$purchaseProducts.certificate_no$': search}]},
    include: [
      {
        model: PurchaseProductModel,
        as: 'purchaseProducts',
        required: true,
        include: [
          {
            model: ProductModel,
            as: 'product',
            required: true
          }
        ]
      },
      {
        model: UserModel,
        as: 'supplier',
      },
      {
        model: UserModel,
        as: 'purchaseBy',
      }
    ]
  });
  for(let i = 0; i < purchases.length; i++){
    let item = purchases[i];
    let purchaseP = await PurchaseProductModel.findOne({where: {purchase_id: item.id, [Op.or]: [{'$product.product_code$': search}, {certificate_no: search}]}, include: [
      {
        model: ProductModel,
        as: 'product',
        required: true
      }
    ]});
    let product_id = 0;
    if(purchaseP){
      product_id = purchaseP.product_id;
    }
    let thisObj = {
      id: item.id,
      invoice_number: item.invoice_number,
      invoice_date: formatDateTime(item.invoice_date, 8),
      main_invoice_date: item.invoice_date,
      sender_name: item.supplier ? item.supplier.name : '',
      sender_mobile: item.supplier ? item.supplier.mobile : '',
      receiver_name: item.purchaseBy ? item.purchaseBy.name : '',
      receiver_mobile: item.purchaseBy ? item.purchaseBy.mobile : '',
      type: item.is_assigned ? 'received' : 'purchase',
      type_display: item.is_assigned ? 'Received' : 'Purchase',
      product_id: product_id
    }
    items.push(thisObj);
  }

  //search from returns - a returned piece is found through the sale / purchase
  //product it came back from, which is where its certificate lives
  let returns = await ReturnModel.findAll({
    order: [['id', 'DESC']],
    attributes: { exclude: ['req_data'] },
    where: {
      table_type: { [Op.in]: ['sales', 'purchases'] },
      [Op.or]: [
        { '$returnProducts.saleProduct.certificate_no$': search },
        { '$returnProducts.purchaseProduct.certificate_no$': search },
        { '$returnProducts.product.product_code$': search },
      ],
    },
    include: [
      {
        model: ReturnProductModel,
        as: 'returnProducts',
        required: true,
        include: [
          { model: SaleProductModel, as: 'saleProduct' },
          { model: PurchaseProductModel, as: 'purchaseProduct' },
          { model: ProductModel, as: 'product' },
        ],
      },
      {
        model: SaleModel,
        as: 'sale',
        include: [
          { model: UserModel, as: 'user' },
          { model: UserModel, as: 'saleBy' },
        ],
      },
      {
        model: PurchaseModel,
        as: 'purchase',
        include: [
          { model: UserModel, as: 'supplier' },
          { model: UserModel, as: 'purchaseBy' },
        ],
      },
    ],
  });
  for (const item of returns) {
    const isSale = item.table_type == 'sales';
    const doc = isSale ? item.sale : item.purchase;
    if (!doc) continue;
    /* a sale return comes back from the customer to the seller; a purchase
       return goes from the buyer back to the supplier */
    const sender = isSale ? doc.user : doc.purchaseBy;
    const receiver = isSale ? doc.saleBy : doc.supplier;
    const matched = item.returnProducts.find((rp) => {
      const src = isSale ? rp.saleProduct : rp.purchaseProduct;
      return (src && src.certificate_no == search) || (rp.product && rp.product.product_code == search);
    });
    items.push({
      id: item.id,
      invoice_number: doc.invoice_number,
      invoice_date: formatDateTime(item.return_date || item.created_at, 8),
      main_invoice_date: item.return_date || item.created_at,
      sender_name: sender ? sender.name : '',
      sender_mobile: sender ? sender.mobile : '',
      receiver_name: receiver ? receiver.name : '',
      receiver_mobile: receiver ? receiver.mobile : '',
      type: isSale ? 'sale_return' : 'purchase_return',
      type_display: isSale ? 'Sale Return' : 'Purchase Return',
      product_id: matched ? matched.product_id : 0,
    });
  }

  items.sort(function(a,b){
    return new Date(b.main_invoice_date) - new Date(a.main_invoice_date);
  });

  res.send(formatResponse({items: items, total: items.length}, 'Search results.'));

}

