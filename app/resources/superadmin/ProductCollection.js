const { isObject, isEmpty, getFileAbsulatePath, isArray, arrayColumn, productTypeDisplay, priceFormat, displayAmount, weightFormat } = require("@helpers/helper");
const {ProductSizeCollection} = require("@resources/superadmin/ProductSizeCollection");
const {ProductMaterialCollection} = require("@resources/superadmin/ProductMaterialCollection");
const {ProductCertificateCollection} = require("@resources/superadmin/ProductCertificateCollection");
const {calculateProductPriceCart} = require("@library/common");
const db = require("@models");
const ProductSizeMaterialModel = db.product_size_materials;
const MaterialModel = db.materials;
const SizeModel = db.sizes;
const UnitModel = db.units;
const _ = require("lodash");

const ProductCollection = async(data, params) => {
    if(isObject(data)){
        return await getModelObject(data, params);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i], params));
        }
        return arr;
    }
}

const getModelObject = async(data, params) => {
    let images = [], default_image = '';
    if(isArray(data.images)){
        for(let i = 0; i < data.images.length; i++){
            images.push({
                file_name: data.images[i].file_name,
                path: getFileAbsulatePath(data.images[i].path),
            })
        }
    }
    let main_image = !isEmpty(data.main_image) ? getFileAbsulatePath(data.main_image) : '';
    let video = '';
    if(!isEmpty(data.video)){
        video = getFileAbsulatePath(data.video);
    }

    let sizes = data.sizes ? ProductSizeCollection(data.sizes) : [];
    sizes.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    let materials = data.materials.sort((a, b) => a.product_materials.id - b.product_materials.id);
    materials = materials ? await ProductMaterialCollection(materials, params) : [];
    /* let gmaterials = materials.filter((itm) => itm.name.toLowerCase().indexOf('gold') !== -1);
    let ngmaterials = materials.filter((itm) => itm.name.toLowerCase().indexOf('gold') === -1);
    let smaterials = gmaterials.concat(ngmaterials);
    materials = smaterials */
    if(data.id == '3'){
        console.log("materials: ",materials);
        for(let i = 0; i < data.materials.length; i++){
            console.log("product_material: ",data.materials[i].product_materials);
        }
    }
    let certificates = data.certificates ? ProductCertificateCollection(data.certificates) : [];
    let sizeNames = arrayColumn(sizes, 'name');
    let materialNames = arrayColumn(materials, 'name');
    let certificateNames = arrayColumn(certificates, 'name');

    let marerialGroups = [];
    for(let i = 0; i < materials.length; i++){
        if(materials[i].id && materials[i].id != null){
            marerialGroups[materials[i].id] = (materials[i].group);
        }
    }

    let taxInfo = null;
    if('tax' in data && data.tax){
        taxInfo = {
            name: data.tax.name,
            cgst: parseFloat(data.tax.cgst),
            sgst: parseFloat(data.tax.sgst),
            igst: parseFloat(data.tax.igst),
        }
    }

    let size_materials = [], materials_for_price = [];
    let sizeMatarialsData = await ProductSizeMaterialModel.findAll({
        where:{product_id: data.id},
        include: [
            {
                model: MaterialModel,
                as: 'material',
            },
            {
                model: SizeModel,
                as: 'size',
            },
            {
                model: UnitModel,
                as: 'unit',
            }
        ]
    });
    for(let i = 0; i < sizeMatarialsData.length; i++){
        let purities = sizeMatarialsData[i].purities.split(",").map(Number);
        if(data.type == "material"){
            size_materials.push({
                size_id: '',
                size_name: '',
                materials: [
                    {
                        material_id: sizeMatarialsData[i].material_id,
                        material_name: sizeMatarialsData[i].material ? sizeMatarialsData[i].material.name : '',
                        purities: purities,
                        weight: weightFormat(sizeMatarialsData[i].weight),
                        unit_id: sizeMatarialsData[i].unit_id,
                        quantity: sizeMatarialsData[i].quantity,
                        unit_name: sizeMatarialsData[i].unit ? sizeMatarialsData[i].unit.name : '',
                    }
                ]
            })
        }else{
            let index =  _.findIndex(size_materials, (item) => item.size_id == sizeMatarialsData[i].size_id);
            if(index !== -1){
                size_materials[index].materials.push({
                    material_id: sizeMatarialsData[i].material_id,
                    material_name: sizeMatarialsData[i].material ? sizeMatarialsData[i].material.name : '',
                    purities: purities,
                    weight: weightFormat(sizeMatarialsData[i].weight),
                    unit_id: sizeMatarialsData[i].unit_id,
                    quantity: sizeMatarialsData[i].quantity,
                    unit_name: sizeMatarialsData[i].unit ? sizeMatarialsData[i].unit.name : '',
                });
                /* let gmaterials = size_materials[index].materials.filter((itm) => itm.material_name.toLowerCase().indexOf('gold') !== -1);
                let ngmaterials = size_materials[index].materials.filter((itm) => itm.material_name.toLowerCase().indexOf('gold') === -1);
                let smaterials = gmaterials.concat(ngmaterials);
                size_materials[index].materials = smaterials; */
            }else{
                size_materials.push({
                    size_id: sizeMatarialsData[i].size_id,
                    size_name: sizeMatarialsData[i].size ? sizeMatarialsData[i].size.name : '',
                    materials: [
                        {
                            material_id: sizeMatarialsData[i].material_id,
                            material_name: sizeMatarialsData[i].material ? sizeMatarialsData[i].material.name : '',
                            purities: purities,
                            weight: weightFormat(sizeMatarialsData[i].weight),
                            unit_id: sizeMatarialsData[i].unit_id,
                            quantity: sizeMatarialsData[i].quantity,
                            unit_name: sizeMatarialsData[i].unit ? sizeMatarialsData[i].unit.name : '',
                        }
                    ]
                });
            }
        }
    }

    let total_mrp_price = 0, total_weight = 0, total_weight_display = '';
    if(size_materials.length){
        let item = size_materials[0];
        for(let i = 0; i < item.materials.length; i++){
            materials_for_price.push({
                material_id: item.materials[i].material_id,
                purity_id: item.materials[i].purities[0],
                unit: {name: item.materials[i].unit_name},
                weight: weightFormat(item.materials[i].weight),
                quantity: data.type != "material" ? item.materials[i].quantity : 1,
            })
        }
        let priceMaterials = await calculateProductPriceCart(materials_for_price, data.sub_category, data.type == "material", 'admin');
        total_mrp_price = priceMaterials.total_mrp_price;
        if(data.type == "material"){
            total_weight = materials_for_price.length ? weightFormat(materials_for_price[0].weight) : 0;
            total_weight_display = total_weight + ' ' + (materials_for_price.length ? materials_for_price[0].unit.name : '');
        }else{
            total_weight = weightFormat(data.weight);
            total_weight_display = total_weight + ' gm';
        }
    }

    let tags = [];
    if('tags' in data && data.tags.length){
        for(let item of data.tags){
            tags.push(item.tag);
        }
    }

    return {
        id: data.id,
        category_id: data.category_id,
        sub_category_id: data.sub_category_id,
        name: data.name,
        added_by_name: data.addedBy ? data.addedBy.name : '',
        tax_rate_id: data.tax_rate_id,
        product_code: data.product_code,
        certificate_id: data.certificate_id,
        description: data.description,
        short_desc: data.short_desc,
        keywords: data.keywords,
        meta_title: data.meta_title,
        type: data.type,
        type_diplay: productTypeDisplay(data.type),
        description: data.description,
        licence_no: data.licence_no,
        status: data.status,
        is_featured: data.is_featured,
        certified: data.certified,
        certified_display: data.certified ? 'Yes' : 'No',
        images: images,
        video: video,
        sizes: sizes,
        materials: materials,
        marerialGroups: marerialGroups,
        certificates: certificates,
        //certificate: data.certificate ? data.certificate.name : '',
        category: data.category ? data.category.name : '',
        sub_category: data.sub_category ? data.sub_category.name : '',
        display_size: sizeNames.join(', '),
        display_material: materialNames.join(', '),
        display_certificate: certificateNames.join(', '),
        tax_info: taxInfo,
        making_charge_type: data.sub_category ? data.sub_category.making_charge_type : '',
        making_charge: data.sub_category ? priceFormat(data.sub_category.making_charge) : 0,
        default_image: main_image,
        size_materials: size_materials,
        mrp: total_mrp_price,
        mrp_display: displayAmount(total_mrp_price),
        total_weight: total_weight,
        total_weight_display: total_weight_display,
        tags: tags,
        main_image: main_image
    }
}

module.exports = {
    ProductCollection
}
