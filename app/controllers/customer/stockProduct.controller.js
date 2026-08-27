const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const {isEmpty, isArray, convertUnitToGram, displayAmount, getDiscountedText, arrayColumn} = require("@helpers/helper");
const {updateOrCreate} = require("@library/common");
const { getPaginationOptions } = require('@helpers/paginator')
const {ProductCollection} = require("@resources/customer/ProductCollection");
const {ProductListCollection} = require("@resources/customer/ProductListCollection");
const {NewProductListCollection} = require("@resources/customer/NewProductListCollection");
const {ProductDetailsCollection} = require("@resources/customer/ProductDetailsCollection");
const {NewProductDetailsCollection} = require("@resources/customer/NewProductDetailsCollection");
const {CategoryCollection} = require("@resources/customer/CategoryCollection");
const { Op, QueryTypes } = require("sequelize");
const sequelize = db.sequelize;
const ProductModel = db.products;
const ProductMaterialModel = db.product_materials;
const MaterialPriceModel = db.material_prices;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const CertificateModel = db.certificates;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const PurityModel = db.purities;
const UnitModel = db.units;
const StockModel = db.stocks;
const StockMaterialModel = db.stock_materials;
const MaterialPricePurityModel = db.material_price_purities;
const TaxSlabModel = db.tax_slabs;
const RecentlyViewModel = db.recently_views;
const ProductTagModel = db.product_tags;
const UserModel = db.users;

/**
 * Retrieve all product categories
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, category, subcategory, search, sort_by, is_featured, best_selling, offer, recent_view, cookie_id } = req.query;
  let conditions = {};
  let orderBy = ['name', 'ASC'];
  if(sort_by == "whats_new"){
    orderBy = ['id', 'DESC'];
  }

  const paginatorOptions = (page && limit) ? getPaginationOptions(page, limit) : {};
  let subQueryData = !isEmpty(search) ? {subQuery: false} : {};
  /*ProductModel.findAndCountAll({ 
    where: conditions,
    order: [orderBy],
    ...paginatorOptions,
    include: [
      {
        model: CategoryModel,
        as: 'category',
        required: true,
        where: (!isEmpty(category)) ? {slug: category} : {}
      },
      {
        model: SubCategoryModel,
        as: 'sub_category',
        required: true,
        where: (!isEmpty(subcategory)) ? {slug: subcategory} : {}
      },
      {
        model: TaxSlabModel,
        as: 'tax',
      },
      {
        model: ProductTagModel,
        as: 'tags',
      }
    ],
    distinct: true,
    ...subQueryData
  })*/

    let sizeConditions = {};
    let stockMaterialConditions = {};
    let _include = [
      {
        model: SizeModel,
        as: "size",
        where: sizeConditions,
      },
      {
        model: StockMaterialModel,
        as: "stockMaterials",
        required: true,
        where: stockMaterialConditions,
        separate: true,
        include: [
          {
            model: MaterialModel,
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
    ];
    //if (type == "product" || type == "return") {
      let productConditions = {};
      if(!isEmpty(search)){
        productConditions = {...productConditions, [Op.or]: [{name: {[Op.like]: `%${search}%` }}, {'$tags.tag$': {[Op.like]: `%${search}%` }}, {'$category.name$': {[Op.like]: `%${search}%` }}, {'$sub_category.name$': {[Op.like]: `%${search}%` }}]};
      }

      if(is_featured == 1){
        productConditions.is_featured = true;
      }else if(is_featured == 0){
        productConditions.is_featured = false;
      }
    
      if(best_selling == 1){
        let query = "SELECT product_id, COUNT(id) FROM order_products WHERE deleted_at IS NULL GROUP BY product_id ORDER BY COUNT(id) DESC LIMIT 10";
        const productObj = await sequelize.query(query, { type: QueryTypes.SELECT });
        let ids = arrayColumn(productObj, 'product_id');
        productConditions.id = {[Op.in]: ids};
      }
    
      if(recent_view == 1){
        cookie_id = cookie_id || null;
        let recentlyViews = await RecentlyViewModel.findAll({
          where: {[Op.or]: [{user_id: req.userId}, {cookie_id: cookie_id}]},
          group: ['product_id'],
          attributes: ['product_id'], raw : true
        });
        let ids = arrayColumn(recentlyViews, 'product_id');
        productConditions.id = {[Op.in]: ids};
      }

      _include.push({
        model: ProductModel,
        as: "product",
        required: true,
        where: productConditions,
        include: [
          {
            model: CategoryModel,
            as: "category",
            required: true,
            where: (!isEmpty(category)) ? {slug: category} : {}
          },
          {
            model: SubCategoryModel,
            as: "sub_category",
            required: true,
            where: (!isEmpty(subcategory)) ? {slug: subcategory} : {}
          },
          {
            model: CertificateModel,
            as: "certificates",
          },
          {
            model: TaxSlabModel,
            as: "tax",
          },
          {
            model: ProductTagModel,
            as: 'tags',
          }
        ],
      });
    /*} else {
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
        ],
      });
    }*/
    
    if(!isEmpty(offer)){
      try {
        offer = offer.split(",");
        let ids = [];
        for(let i = 0; i < offer.length; i++){
          if(offer[i]){
            ids.push(offer[i].trim());
          }
        }
        conditions.id = {[Op.in]: ids};
      } catch (error) {
        
      }
    }
    StockModel
      .findAndCountAll({
        order: [["id", "DESC"]],
        ...paginatorOptions,
        where: conditions,
        include: _include,
        distinct: true,
        ...subQueryData
      })
  
  .then(async (data) => {
    compactLog('stock.find count:', data && (data.count || (Array.isArray(data.rows) ? data.rows.length : 0)));
    let result = {
      //items: await ProductListCollection(data.rows, req),
      items: await NewProductListCollection(data.rows, req),
      total: data.count
    }
    res.send(formatResponse(result, 'Products list'));
  })
  .catch(err => {
    console.error('stock.find error:', err && err.message ? err.message : err);
    res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
  });

  
};

/**
 * View Product
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.viewNew = async (req, res) => {
  let { slug, recently_view, cookie_id } = req.query;

  let sizeConditions = {};
  let stockMaterialConditions = {};
  let _include = [
    {
      model: SizeModel,
      as: "size",
      where: sizeConditions,
    },
    {
      model: StockMaterialModel,
      as: "stockMaterials",
      required: true,
      where: stockMaterialConditions,
      separate: true,
      include: [
        {
          model: MaterialModel,
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
  ];

  let productConditions = {};
  /*if(!isEmpty(search)){
    productConditions = {...productConditions, [Op.or]: [{name: {[Op.like]: `%${search}%` }}, {'$tags.tag$': {[Op.like]: `%${search}%` }}, {'$category.name$': {[Op.like]: `%${search}%` }}, {'$sub_category.name$': {[Op.like]: `%${search}%` }}]};
  }

  if(is_featured == 1){
    productConditions.is_featured = true;
  }else if(is_featured == 0){
    productConditions.is_featured = false;
  }
  if(!isEmpty(offer)){
    try {
      offer = offer.split(",");
      let ids = [];
      for(let i = 0; i < offer.length; i++){
        if(offer[i]){
          ids.push(offer[i].trim());
        }
      }
      productConditions.id = {[Op.in]: ids};
    } catch (error) {
      
    }
  }*/

  /*if(best_selling == 1){
    let query = "SELECT product_id, COUNT(id) FROM order_products WHERE deleted_at IS NULL GROUP BY product_id ORDER BY COUNT(id) DESC LIMIT 10";
    const productObj = await sequelize.query(query, { type: QueryTypes.SELECT });
    let ids = arrayColumn(productObj, 'product_id');
    productConditions.id = {[Op.in]: ids};
  }

  if(recent_view == 1){
    cookie_id = cookie_id || null;
    let recentlyViews = await RecentlyViewModel.findAll({
      where: {[Op.or]: [{user_id: req.userId}, {cookie_id: cookie_id}]},
      group: ['product_id'],
      attributes: ['product_id'], raw : true
    });
    let ids = arrayColumn(recentlyViews, 'product_id');
    productConditions.id = {[Op.in]: ids};
  }*/

  _include.push({
    model: ProductModel,
    as: "product",
    required: true,
    where: productConditions,
    include: [
      {
        model: CategoryModel,
        as: "category",
        required: true,
        //where: (!isEmpty(category)) ? {slug: category} : {}
      },
      {
        model: SubCategoryModel,
        as: "sub_category",
        required: true,
        //where: (!isEmpty(subcategory)) ? {slug: subcategory} : {}
      },
      {
        model: CertificateModel,
        as: "certificates",
      },
      {
        model: MaterialModel,
        as: 'materials',
        include: [
          {
            model: UnitModel,
            as: 'unit',
          },
          {
            model: PurityModel,
            as: 'purities',
          }
        ]
      },
      {
        model: TaxSlabModel,
        as: "tax",
      },
      {
        model: ProductTagModel,
        as: 'tags',
      }
    ],
  });
  compactLog("slug : ", slug);
  const stock = await StockModel
    .findOne({
      where: { certificate_no: slug },
      include: _include,
    });
  
  if (!stock) {
    return res.status(errorCodes.default).send(formatErrorResponse('Product not found'));
  }
  compactLog("stock id:", stock && stock.id);
  res.send(formatResponse(await NewProductDetailsCollection(stock, req), "Product details"));
};

/**
 * View Product
 * 
 * @param {*} req 
 * @param {*} res 
 */
exports.view = async (req, res) => {
  let { slug, recently_view, cookie_id } = req.query;
  let product = await ProductModel.findOne({ 
    where: { slug: slug, status: true },
    include: [
      {
        model: CategoryModel,
        as: 'category',
      },
      {
        model: SubCategoryModel,
        as: 'sub_category'
      },
      {
        model: CertificateModel,
        as: 'certificates',
      },
      {
        model: MaterialModel,
        as: 'materials',
        include: [
          {
            model: UnitModel,
            as: 'unit',
          },
          {
            model: PurityModel,
            as: 'purities',
          }
        ]
      },
      {
        model: SizeModel,
        as: 'sizes',
      },
      {
        model: TaxSlabModel,
        as: 'tax',
      }
    ],
  });
  if (!product) {
    return res.status(errorCodes.default).send(formatErrorResponse('Product not found'));
  }
  res.send(formatResponse(await ProductDetailsCollection(product, req), "Product details"));

  if(recently_view == 1){
    let user_id = req.userId || null;
    cookie_id = cookie_id || null;
    let condition = {[Op.or]: [{user_id: user_id}, {cookie_id: cookie_id}], product_id: product.id};
    updateOrCreate(RecentlyViewModel, condition, {user_id: user_id, cookie_id: cookie_id, product_id: product.id});
  }

  /*let size_id = !isEmpty(req.query.size_id) ? req.query.size_id : '';
  let product = await ProductModel.findOne({ where: { id: req.params.id },
    include: [
      {
        model: StockModel, 
        as: 'stocks',
      },
      {
        model: CategoryModel,
        as: 'category',
      },
      {
        model: SubCategoryModel,
        as: 'sub_category',
      },
      {
        model: CertificateModel,
        as: 'certificate',
      },
      {
        model: MaterialModel,
        as: 'materials',
        include: [
          {
            model: UnitModel,
            as: 'unit',
          },
          {
            model: MaterialPriceModel,
            as: 'material_price',
            include: [
              {
                model: MaterialPricePurityModel,
                as: 'materialPricePurities'
              }
            ]
          },
        ]
      },
      {
        model: SizeModel,
        as: 'sizes',
        where: (!isEmpty(size_id)) ? {id: size_id} : {},
        include: [
          { 
            model: StockModel, 
            as: 'stocks',
            where: {product_id: req.params.id, user_id: null},
            include: [
              {
                model: StockMaterialModel,
                as: 'stockMaterials',
                include: [
                  {
                    model: MaterialModel,
                    as: 'material',
                    include: [
                      {
                        model: PurityModel,
                        as: 'purities',
                      },
                    ]
                  },
                  {
                    model: UnitModel,
                    as: 'unit',
                  },
                  {
                    model: PurityModel,
                    as: 'purity',
                  },
                ]
              },
              {
                model: ProductModel,
                as: 'product',
              },
              {
                model: SizeModel,
                as: 'size',
              },
           ]
          }
        ],
      },
      
    ]
  });
  if (!product) {
    return res.status(errorCodes.default).send(formatErrorResponse('Product not found'));
  }
  res.send(formatResponse(ProductResource(product), "Product details"));*/
};


/**
 * get price info
 * 
 * @param {*} req
 * @param {*} res 
 */
exports.productPriceInfo = async (req, res) => {
  let data = req.body;

  let materialPrices = {
        price: 0,
        sale_price: 0,
        discount: 0,
        making_charge: 0,
        display_price: '',
        display_sale_price: '',
        display_discount: '',
        display_making_charge: '',
  };
  let stock_id = data.stock_id;


  let stock = await StockModel.findOne({ 
     where:{
      id: stock_id
     }
  });

  if (!stock) {
    return res.status(errorCodes.default).send(formatErrorResponse('Stock not found'));
  }


  let product_id = stock.product_id;

  let product = await ProductModel.findOne({ 
      where: { 
        id: product_id 
      },
    include: [
      {
        model: StockModel, 
        as: 'stocks',
      },
      {
        model: CategoryModel,
        as: 'category',
      },
      {
        model: SubCategoryModel,
        as: 'sub_category',
      },
    ]
  });

  let stock_materials = await StockMaterialModel.findAll({ 
    where:{
      stock_id: stock_id
    }
  });

  let making_charge = '';
  let making_charge_type = ''; 

  if(product && product.sub_category){ 
    making_charge = product.sub_category.making_charge;
    making_charge_type = product.sub_category.making_charge_type;

    if(!isEmpty(making_charge) && !isEmpty(making_charge_type)){
        let total_quantity = 0;
        let total_weight = 0;

      for(let i = 0; i < stock_materials.length; i++){
        total_quantity += !isEmpty(stock_materials[i]['quantity']) ? parseInt(stock_materials[i]['quantity']) : 0;
        total_weight += !isEmpty(stock_materials[i]['weight']) ? parseFloat(stock_materials[i]['weight']) : 0;
      }

      if(making_charge_type == 'per_gram' && total_weight > 0){
        materialPrices.making_charge = total_weight * making_charge;
        materialPrices.display_making_charge = displayAmount(materialPrices.making_charge);
      }

      else if(making_charge_type == 'per_piece' && total_quantity > 0){
        materialPrices.making_charge = total_quantity * making_charge;
        materialPrices.display_making_charge = displayAmount(materialPrices.making_charge);
      }
    }
  }


  let size_id = stock.size_id;
  let stock_material = await StockMaterialModel.findOne({ 
      where:{
        stock_id: stock_id
      }
  });

  let material_id = !isEmpty(stock_material) ? stock_material.material_id: null;
  let purity_id = !isEmpty(stock_material) ? stock_material.purity_id: null;
  let unit_id = !isEmpty(stock_material) ? stock_material.unit_id: null;
  let weight =  !isEmpty(stock_material) ? stock_material.weight: null;

  let product_materials = await ProductMaterialModel.findOne({ 
    where:{
      product_id: product_id,
      material_id: material_id
    }
  });

  if(product_materials){
    let material_price = await MaterialPriceModel.findOne({ where: { material_id: material_id },
      include: [
        {
          model: MaterialPricePurityModel,
          as: 'materialPricePurities',
          where: {purity_id: purity_id}
        },
      ]
    });

    let unit = await UnitModel.findOne({ where: { id: unit_id }});
    let unit_name = !isEmpty(unit) ? unit.name : '';
    let size = await SizeModel.findOne({ where: { id: size_id }});
    let size_name = !isEmpty(size) ? size.name : '';

    if(weight){
      weight = convertUnitToGram(unit_name, weight);
    }
  
    if(material_price && size_name && unit && weight && unit_name){
      for(let j = 0; j < material_price.materialPricePurities.length; j++){
        let item = material_price.materialPricePurities[j];
       
        if(!isEmpty(item.mrp)){
          let price = item.mrp * weight; 
          let original_price_per_gram = item.price - (item.mrp * item.customer_discount / 100);
          let total_price = original_price_per_gram * weight;
          materialPrices.sale_price += parseFloat(total_price);
          materialPrices.price += parseFloat(total_price);
        }
      }

      materialPrices.display_price = (materialPrices.price > 0) ? displayAmount(materialPrices.price) : '';
      materialPrices.display_sale_price = (materialPrices.sale_price > 0) ? displayAmount(materialPrices.sale_price) : '';
      materialPrices.display_discount = (materialPrices.discount > 0) ? getDiscountedText(materialPrices.discount, 'percent') : '';
      materialPrices.discount = (materialPrices.discount > 0) ? displayAmount(materialPrices.discount) : '';
    }
  } 

  res.send(formatResponse(materialPrices));
}

/**
 * Get recently view categories
 * 
 * @param {*} req
 * @param {*} res 
 */
exports.recentlyViewCategories = async (req, res) => {
  let categories = await RecentlyViewModel.findAll({
    where: {user_id: req.userId},
    group: ['category_id'],
    attributes: ['category_id'], raw : true
  });
  let categoryIds = arrayColumn(categories, 'category_id');
  categories = await CategoryModel.findAll({ 
    order:[['name', 'ASC']],
    where: {id: {[Op.in]: categoryIds}}
  });
  categories = CategoryCollection(categories);

  res.send(formatResponse(categories));
}



