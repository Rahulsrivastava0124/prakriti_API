const config = require("@config/auth.config");
const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const { Op } = require("sequelize");
const { getPaginationOptions } = require('@helpers/paginator')
const {CartCollection} = require("@resources/sales_executive/CartCollection");
const {ProductMaterialCollection} = require("@resources/sales_executive/ProductMaterialCollection");
const cartsModel = db.carts;
const { isEmpty,priceFormat, displayAmount } = require("@helpers/helper");
const { findIndex } = require("lodash");
const cartMaterialsModel =db.cart_materials;
const materialModel =db.materials
const UnitModel = db.units;
const productModel = db.products
const sizeModel = db.sizes
const PurityModel = db.purities
const productMaterialModel = db.product_materials
const SubCategoryModel = db.sub_categories;

/**
 * Retrieve all Cart
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
  let { page, limit, all } = req.query;
  let conditions = {user_id: req.userId};
  const paginatorOptions = getPaginationOptions(page, limit);
  cartsModel.findAndCountAll({ 
    order:[['id', 'ASC']],
    where: conditions,
    //offset: paginatorOptions.offset,
    //limit: paginatorOptions.limit,
    include: [
      {
        model: cartMaterialsModel,
        as: 'cartMaterial',
        include:[
          {
            model: materialModel,
            as:'material'
          },
          {
            model: UnitModel,
            as:'unit'
          },
          {
            model: PurityModel,
            as:'purity'
          }
        ]
      },
      {
        model: productModel,
        as: 'product',
        include:[
          {
            model: SubCategoryModel,
            as: 'sub_category',
            required: true
          },
        ]
      },
      {
        model: sizeModel,
        as: 'size'
      }
    ]
  }).then(async (data) => {
    let result = {
      items: await CartCollection(data.rows),
      total: data.rows.length,
    }

    let item_total = 0, total_payable = 0;
    for(let i = 0; i < result.items.length; i++){
      item_total += result.items[i].total_price;
    }
    result.item_total = priceFormat(item_total);
    result.item_total_display = displayAmount(item_total);
    result.total_payable = priceFormat(item_total);
    result.total_payable_display = displayAmount(item_total);

    res.send(formatResponse(result, 'carts'));
  })
  .catch(err => {
    res.status(errorCodes.default).send(formatErrorResponse(err));
  });
}

/**
 * Create Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
 exports.store = async (req, res) => {
    let data = req.body;
    try{
      let existing_cart = await cartsModel.findOne({where: {user_id: req.userId, product_id :data.product_id}});
      if(data.type == "material" && !isEmpty(existing_cart)){// if material type product already in cart
        cartsModel.update(
          {
            stock_id: !isEmpty(data.stock_id) ? data.stock_id : existing_cart.stock_id,
            quantity: existing_cart.quantity + 1,
            total_weight: priceFormat(existing_cart.total_weight) + priceFormat(data.total_weight),
            size_id: data.size_id
          },
         { where: { id: existing_cart.id} }).then(async result => {
          for(let cm=0; cm<data.materials.length; cm++){
            let product_material = data.materials[cm];
            // check cart material already in cart
            let cart_materials = await cartMaterialsModel.findOne({ where: {cart_id: existing_cart.id, material_id: product_material.material_id}})

            if(cart_materials){
             await cartMaterialsModel.update(
                {
                  weight: priceFormat(cart_materials.weight) + priceFormat(product_material.weight),
                  quantity: parseInt(cart_materials.quantity) +parseInt(product_material.quantity)
                },
               { where: { id: cart_materials.id} })

            }else{
              await cartMaterialsModel.create({
                cart_id: existing_cart.id,
                material_id: product_material.material_id,
                purity_id: product_material.purity_id,
                weight: product_material.weight,
                unit_id: product_material.unit_id,
                quantity: product_material.quantity
              });

            }
          }
        })
      }else{// if material type product not in cart or non material add all time
        let cart = await cartsModel.create({
          product_id :data.product_id,
          stock_id: !isEmpty(data.stock_id) ? data.stock_id : null,
          user_id: req.userId,
          quantity: 1,
          total_weight: data.total_weight || null,
          size_id: data.size_id
        });

        for(let x = 0; x < data.materials.length; x++){
          let material = data.materials[x];
          await cartMaterialsModel.create({
            cart_id: cart.id,
            material_id: material.material_id,
            purity_id: material.purity_id,
            weight: material.weight,
            unit_id: material.unit_id,
            quantity: material.quantity
          });
        }
      }
      res.send(formatResponse([], "Product added to cart successfully!"));
    }catch(err){
      // await t.rollback();
      return res.status(errorCodes.default).send(formatErrorResponse('Cart does not created due to some error'));
    } 
   

    /*
    let type = data.type;
    let query = null;
    let materials = data.materials;
    
    const postData1 = {
      product_id :data.product_id,
      stock_id: !isEmpty(data.stock_id) ? data.stock_id : null,
      user_id: req.userId,
      quantity: 1,
    };

    if(type == 'material'){
      postData1.size_id = null;
      query = {user_id: req.userId, product_id :data.product_id};
    }else{
      postData1.size_id = !isEmpty(data.size_id) ? data.size_id : null;
      query = {user_id: req.userId, product_id :data.product_id, size_id: data.size_id};
    }

    let existing_cart = await cartsModel.findOne({where: query});

    if(!isEmpty(existing_cart)){
       let cart_id = existing_cart.id;
       postData1.quantity = existing_cart.quantity + 1;

       cartsModel.update(postData1, { where: { id: cart_id} }).then(result => {

        productMaterialModel.findAll({where: {product_id:data.product_id}}).then(productMaterials => {
            productMaterials = ProductMaterialCollection(productMaterials);
            productMaterials.forEach(product_material => {
            
              cartMaterialsModel.findOne({ where: {cart_id: cart_id, material_id: product_material.material_id}}).then(existing_cart_material => {

                if(!isEmpty(existing_cart_material)){

                  const postData2 = {
                    cart_id :cart_id,
                    material_id : product_material.material_id,
                    weight: null,
                    quantity: postData1.quantity
                  };

                let purity_index = findIndex(materials, function(o) { return o.material_id == product_material.material_id; });
                
                if(purity_index >= 0){
                  postData2.purity_id = materials[purity_index]['purity_id'];
                }

                  cartMaterialsModel.update(postData2, { where: { id: existing_cart_material.id} });
                }
                else{
                  const postData2 = {
                    cart_id :cart_id,
                    material_id : product_material.material_id,
                    weight: null,
                    quantity:  postData1.quantity
                  };

                  let purity_index = findIndex(materials, function(o) { return o.material_id == product_material.material_id; });
                
                  if(purity_index >= 0){
                    postData2.purity_id = materials[purity_index]['purity_id'];
                  }

                  cartMaterialsModel.create(postData2); 
                }
              });
          });
      });

        res.send(formatResponse([], "Product updated to cart successfully"));
      }).catch(error => { 
        return res.status(errorCodes.default).send(formatErrorResponse('Cart does not updated due to some error' + error));
      });
    }

    else{
      cartsModel.create(postData1).then(result => {

        productMaterialModel.findAll({where: {product_id:data.product_id}}).then(productMaterials => {
          productMaterials = ProductMaterialCollection(productMaterials);
          productMaterials.forEach(product_material => {
              const postData2 = {
                cart_id :result.id,
                material_id : product_material.material_id,
                weight: null,
                quantity: 1
              };

              let purity_index = findIndex(materials, function(o) { return o.material_id == product_material.material_id; });
                
              if(purity_index >= 0){
                postData2.purity_id = materials[purity_index]['purity_id'];
              }
    
              cartMaterialsModel.create(postData2); 
          });
        });

        res.send(formatResponse([], "Product added to cart successfully!"));
      }).catch(error => {
        return res.status(errorCodes.default).send(formatErrorResponse('Cart does not created due to some error' + error));
      }); 
    }*/
  }

    


 /**
 * Update Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */
  exports.update = async (req, res) => {
    let existing_cart = await cartsModel.findOne({where: {id: req.params.id, user_id: req.userId }});
    let data = req.body;

    if(!isEmpty(existing_cart)){

      const postData = {
        cart_id :req.params.id,
        material_id :data.material_id,
        weight: !isEmpty(data.weight) ? data.weight : null,
        quantity: null
      };

      if(quantity > 0){
        cartsModel.update({
          quantity: existing_cart.quantity - 1,
          total_weight: parseFloat(existing_cart.total_weight) - (parseFloat(parseFloatexisting_cart.total_weight)/existing_cart.quantity)
        }, { where: { id: req.params.id} }).then(result => {
          cartMaterialsModel.update(postData, { where: { cart_id: req.params.id} });
          res.send(formatResponse([], "Product updated to cart successfully"));
        }).catch(error => {
          return res.status(errorCodes.default).send(formatErrorResponse('Cart does not updated due to some error' + error));
        });
      }
      else{
          cartsModel.destroy({ where: { id: req.params.id} }).then(result => {
          cartMaterialsModel.destroy({ where: { cart_id: req.params.id} });
          res.send(formatResponse([], "Product updated to cart successfully"));
        }).catch(error => {
          return res.status(errorCodes.default).send(formatErrorResponse('Cart does not updated due to some error' + error));
        });
      }
    }

  }

 /**
 * Remove Cart
 * 
 * @param {*} req 
 * @param {*} res 
 */

exports.delete = async (req, res) => {
  let existing_cart = await cartsModel.findOne({where: {id: req.params.id, user_id: req.userId }});
  
  if(!isEmpty(existing_cart)){
    cartsModel.destroy({ where: { id: existing_cart.id} }).then(async result => {
      await cartMaterialsModel.destroy({ where: { cart_id: existing_cart.id} });
      res.send(formatResponse([], "Product removed from cart successfully"));
    }).catch(error => {
      return res.status(errorCodes.default).send(formatErrorResponse('Cart does not deleted due to some error' + error));
    });
  }
  else{
    return res.status(errorCodes.default).send(formatErrorResponse('Cart does not exists'));
  }

}




