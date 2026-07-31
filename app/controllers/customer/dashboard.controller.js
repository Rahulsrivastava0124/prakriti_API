const { formatResponse, formatErrorResponse, errorCodes } = require("@utils/response.config");
const db = require("@models");
const { Op, QueryTypes } = require("sequelize");
const { getFileAbsulatePath, isEmpty, logoImage } = require("@helpers/helper");
const { getNextUserName, sendEmail } = require("@library/common");
const moment = require('moment');
const dbSequelize = db.sequelize;
const UserModel = db.users;
const HomepageSettingModel = db.homepage_settings;
const BannerModel = db.banners;
const PromocodeModel = db.promocodes;
const NewArrivalModel = db.new_arrivals;
const FestiveOfferModel = db.festive_offers;
const StockProductSliderModel = db.stock_products_slider;
const ProductModel = db.products;
const SubscriberModel = db.subscribers;
const stateModel = db.states;
const CategoryModel = db.categories;
const SubCategoryModel = db.sub_categories;
const {HomepageSettingCollection} = require("@resources/superadmin/HomepageSettingCollection");
const {BannerCollection} = require("@resources/superadmin/BannerCollection");
const {PromocodeCollection} = require("@resources/customer/PromocodeCollection");
const {NewArrivalCollection} = require("@resources/superadmin/NewArrivalCollection");
const {FestiveOfferCollection} = require("@resources/customer/FestiveOfferCollection");
const {StockProductSliderCollection} = require("@resources/customer/StockProductSliderCollection");

/**
 * Customer Dashboard
 *
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
    const user = await UserModel.findOne({
        where: { id: req.userId
        }
    });

    res.send(formatResponse(UserCollection(user), "Dashboard"));
}

/**
 * Homepage Settings
 *
 * @param req
 * @param res
 */
exports.homepagesettings = async (req, res) => {
    HomepageSettingModel.findAll({
        where: {is_active: true},
        order:[['order', 'ASC']]
    }).then((data) => {
        compactLog('homepagesettings count:', Array.isArray(data) ? data.length : typeof data);
        let result = {
            items: HomepageSettingCollection(data),
            total: data.length
        }
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
}

/**
 * Banners
 *
 * @param req
 * @param res
 */
exports.banners = async (req, res) => {
    BannerModel.findAll({
        order:[['id', 'DESC']]
    }).then(async (data) => {
        let result = {
            items: BannerCollection(data),
            total: data.length
        }
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });

}

/**
 * Promocodes
 *
 * @param req
 * @param res
 */
 exports.promocodes = async (req, res) => {
    PromocodeModel.findAll({
        order:[['discount', 'DESC']],
        where: {status: true},
        include: [
            {
              model: CategoryModel,
              as: 'category',
              required: true
            },
            {
              model: SubCategoryModel,
              as: 'sub_category'
            }
        ]
    }).then(async (data) => {
        let result = {
            items: PromocodeCollection(data),
            total: data.length
        }
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });

}

/**
 * New Arrivals
 *
 * @param req
 * @param res
 */
exports.new_arrivals = async (req, res) => {
    NewArrivalModel.findAll({
        order:[['id', 'DESC']]
    }).then(async (data) => {
        let result = {
            items: NewArrivalCollection(data),
            total: data.length
        }
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
}

/**
 * Festive Offers
 *
 * @param req
 * @param res
 */
exports.festive_offers = async (req, res) => {
    FestiveOfferModel.findAll({
        order:[['id', 'DESC']],
        include: [
            {
              model: CategoryModel,
              as: 'category',
              required: true
            },
            {
              model: SubCategoryModel,
              as: 'sub_category'
            }
        ]
    }).then(async (data) => {
        //compactLog(data);
        let result = {
            items: FestiveOfferCollection(data),
            total: data.length
        }
        
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
}

/**
 * Stock Product Banners
 *
 * @param req
 * @param res
 */
exports.stock_products_slider = async (req, res) => {
    StockProductSliderModel.findAll({
        order:[['id', 'DESC']],
        include: [
            {
              model: CategoryModel,
              as: 'category',
              required: true
            },
            {
              model: SubCategoryModel,
              as: 'sub_category'
            }
        ]
    }).then(async (data) => {
        //compactLog(data);
        let result = {
            items: StockProductSliderCollection(data),
            total: data.length
        }
        
        res.send(formatResponse(result));
    })
    .catch(err => {
        res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    });
}

/**
 * Best Retailers
 *
 * @param req
 * @param res
 */
exports.bestRetailers = async (req, res) => {
    let { state, city } = req.query;
    let query = "SELECT users.id, users.profile_image, users.name, users.company_name, states.name as `state_name`, districts.name as `district_name`, users.city, users.mobile, users.state_id, users.created_at, SUM(sales.bill_amount) AS total_amount FROM sales INNER JOIN users ON (users.id = sales.user_id) LEFT JOIN districts ON (districts.id = users.district_id) LEFT JOIN states ON (states.id = users.state_id) WHERE users.role_id = 5 AND users.partner=1 AND sales.is_approved != 2 AND users.deleted_at IS NULL AND sales.deleted_at IS NULL";
    if(state){
        query += ` AND users.state_id='${state}'`;
    }
    if(city){
        query += ` AND users.city LIKE '%${city}%'`;
    }
    query += " GROUP BY users.id ORDER BY total_amount DESC LIMIT 5";
    compactLog("bestRetailers query ===========:> ", query);
    const users = await dbSequelize.query(query, { type: QueryTypes.SELECT });
    let retailers = [];
    for(let item of users){
        let state = await stateModel.findOne({where: {id: item.state_id}});
        let address = [];
        if(item.city){
            address.push(item.city);
        }
        if(item.district_name){
            address.push(item.district_name);
        }
        if(state){
            address.push(state.name);
        }
        retailers.push({
            id: item.id,
            name: item.name,
            company_name: item.company_name || '',
            district_name: item.district_name || '',
            city: item.city || '',
            state_name: state.name || '',
            mobile: item.mobile || '',
            since: 1990,
            address: address.join(", "),
            image: (!isEmpty(item.profile_image)) ? getFileAbsulatePath(item.profile_image) : logoImage()
        })
    }
    res.send(formatResponse(retailers));
}

exports.bestRetailerStates = async (req, res) => {
    /* let { state } = req.query; */
    let query = "SELECT DISTINCT states.id, states.name FROM users INNER JOIN states ON (states.id = users.state_id) WHERE users.role_id = 5 AND users.partner=1 AND users.deleted_at IS NULL";
    /* if(state){
        query += ` AND states.name LIKE '%${state}%'`;
    } */
    query += " ORDER BY states.name ASC";
    compactLog("bestRetailer states query ===========:> ", query);
    const users = await dbSequelize.query(query, { type: QueryTypes.SELECT });
    let retailers = [];
    for(let item of users){
        retailers.push({
            id: item.id,
            name: item.name || ''
        });
    }
    res.send(formatResponse(retailers));
}

exports.bestRetailerCities = async (req, res) => {
    let { state } = req.query;
    let query = "SELECT DISTINCT users.city FROM users WHERE users.role_id = 5 AND users.partner=1 AND users.deleted_at IS NULL AND users.city IS NOT NULL AND users.city != ''";
    if(state){
        query += ` AND users.state_id='${state}'`;
    }
    query += " ORDER BY users.city ASC";
    compactLog("bestRetailer cities query ===========:> ", query);
    const users = await dbSequelize.query(query, { type: QueryTypes.SELECT });
    let retailers = [];
    let c = 0;
    for(let item of users){
        c++;
        retailers.push({
            id: c,
            name: item.city || ''
        });
    }
    res.send(formatResponse(retailers));
}

exports.bestRetailerView = async (req, res) => {
    let { id } = req.query;

    let query = "SELECT users.id, users.profile_image, users.name, users.company_name, states.name as `state_name`, districts.name as `district_name`, users.city, users.landmark, users.mobile, users.email, users.gst, users.state_id, users.created_at, SUM(sales.bill_amount) AS total_amount FROM sales INNER JOIN users ON (users.id = sales.user_id) LEFT JOIN districts ON (districts.id = users.district_id) LEFT JOIN states ON (states.id = users.state_id) WHERE users.role_id = 5 AND users.partner=1 AND sales.is_approved != 2 AND users.deleted_at IS NULL AND sales.deleted_at IS NULL";
    if(id){
        query += ` AND users.id = '${id}'`;
    }
    query += "";
    compactLog("bestRetailer view query ===========:> ", query);
    const users = await dbSequelize.query(query, { type: QueryTypes.SELECT });
    let retailers = [];
    for(let item of users){
        let state = await stateModel.findOne({where: {id: item.state_id}});
        let address = [];
        if(item.city){
            address.push(item.city);
        }
        if(item.district_name){
            address.push(item.district_name);
        }
        if(state){
            address.push(state.name);
        }
        retailers.push({
            id: item.id,
            name: item.name,
            company_name: item.company_name || '',
            district_name: item.district_name || '',
            landmark: item.landmark || '',
            city: item.city || '',
            state_name: state?state.name:'',
            email: item.email || '',
            mobile: item.mobile || '',
            since: 1990,
            address: address.join(", "),
            gst: item.gst || '',
            image: (!isEmpty(item.profile_image)) ? getFileAbsulatePath(item.profile_image) : logoImage()
        });
    }
    if(!retailers.length){
        return res.status(errorCodes.default).send(formatErrorResponse("Retailer not found."));
    }
    res.send(formatResponse(retailers[0]));
}

/**
 * Counts
 *
 * @param req
 * @param res
 */
exports.counts = async (req, res) => {
    let products = await ProductModel.count();
    let retailers = 200;
    let team_members = 100;
    res.send(formatResponse({
        products: products,
        retailers: retailers,
        team_members: team_members
    }));
}

/**
 * Get Next User name
 *
 * @param req
 * @param res
 */
exports.nextUserName = async (req, res) => {
    let id = req.query.id || '';
    let name = await getNextUserName("retailer", id);
    res.send(formatResponse(name));
}

/**
 * Events
 *
 * @param req
 * @param res
 */
exports.events = async (req, res) => {
    let events = [
        {
            name: "Diwali"
        },
        {
            name: "Navratri and Durga Pooja"
        },
        {
            name: "Dussehra"
        },
        {
            name: "Holi"
        },
        {
            name: "Krishna Janmashtami"
        },
        {
            name: "Onam"
        },
        {
            name: "Ganesh Chaturthi"
        },
        {
            name: "Eid-Ul-Fitr"
        }
    ];
    res.send(formatResponse(events));
}

/**
 * subscribers Store
 *
 * @param req
 * @param res
 */
exports.subscribersStore = async (req, res) => {
    let data = req.body, sub = null;
    if(!isEmpty(data.email)){
        sub = await SubscriberModel.findOne({where: {email: data.email}});
    }else{
        sub = await SubscriberModel.findOne({where: {mobile: data.mobile}});
    }
    let date = null;
    try {
        date = data.date ? moment(data.date).format('YYYY-MM-DD') : '';
    } catch (error) {}

    if(sub){
        if(!('name' in data) || isEmpty(data.name)){
            return res.send(formatResponse("", "Subscribed Successfuly."));
        }
        await SubscriberModel.update({
            email: data.email,
            name: data.name,
            mobile: data.mobile,
            date: date,
            event: data.event
        }, { where: { id: sub.id} });
    }else{
        await SubscriberModel.create({
            email: data.email || null,
            name: data.name || null,
            mobile: data.mobile || null,
            date: date || null,
            event: data.event || null
        });
    }
    res.send(formatResponse("", "Saved Successfuly."));
    
}

/**
 * retailer request
 *
 * @param req
 * @param res
 */
exports.retailerRequest = async (req, res) => {
    let data = req.body;
    let message = `
        <h2>New Retailer Request:</h2>
        <h5>Name: <b>${data.name}</b></h5>
        <h5>Mobile: <b>${data.mobile}</b></h5>
        <h5>Notes: <b>${data.notes}</b></h5>
    `;
    try {
        let result = await sendEmail({to: "ratanvihar@gmail.com", subject: 'New Retailer Request', message: message});
        if(!result){
            return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
        }
    } catch (error) {
        //return res.status(errorCodes.default).send(formatErrorResponse(errorCodes.defaultErrorMsg));
    }

    res.send(formatResponse("", "Request Sent Successfuly."));
}




