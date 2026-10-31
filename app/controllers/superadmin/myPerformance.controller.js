const { errorCodes, formatErrorResponse, formatResponse } = require("@utils/response.config");
const db = require("@models");
const {priceFormat, addLog, displayAmount, getDateFromToWhere, isEmpty} = require("@helpers/helper");
const {updateOrCreate} = require("@library/common");
const { getPaginationOptions } = require('@helpers/paginator')
const {MaterialPriceCollection} = require("@resources/superadmin/MaterialPriceCollection");
const { Op } = require("sequelize");
const moment = require('moment');
const sequelize = db.sequelize;
const SalaryStructure = db.salary_structures;
const PaymentModel = db.payments;
const SaleModel = db.sales;
const RetailerVisitModel = db.retailer_visits;

/**
 * Retrieve my performance data
 * @param req
 * @param res
 */
exports.index = async (req, res) => {
    let {months, current, user_id} = req.query;
    user_id = !isEmpty(user_id) ? user_id : req.userId;
    let arr = [];
    if(current == 1){
        let result = await getPerformanceData(moment().startOf('month').format('YYYY-MM-DD'), moment().endOf('month').format('YYYY-MM-DD'), user_id);
        arr = result;
    }else{
        months = parseInt(months);
        for(let i = 1; i <= months; i++){
            let start_date = moment().subtract(i, 'months').startOf('month').format('YYYY-MM-DD');
            let end_date = moment().subtract(i, 'months').endOf('month').format('YYYY-MM-DD');
            let result = await getPerformanceData(start_date, end_date, user_id);
            arr.push(result);
        }
    }

    res.send(formatResponse(arr));

}

const getPerformanceData = async(start_date, end_date, userId) => {
    let sale_achived = 0, visit_achived = 0, sale_achived_percent = 0, visit_achived_percent = 0, sale_due = 0, visit_due = 0, sale_target = 0, visit_target = 0;
    /*
     * Pick the structure in force at any point during the queried period, not
     * just the one that was in force before it began. A structure dated
     * mid-month used to fail this filter because start_date is the first of
     * the month, so a user who saved a new structure effective today saw their
     * own current-month page keep showing zeros - which is what makes the
     * second screenshot in #11 differ from the first.
     *
     * end_date is already the end of the queried period, so this also works
     * for past-month lookups: a structure effective mid-September is used for
     * September, while an October structure stays out of September's totals.
     */
    /* latest effective date wins; id only breaks ties. Ordering by id alone
       let a back-dated correction (created later, effective earlier) override
       a structure that took effect after it. */
    let curentStructure = await SalaryStructure.findOne({
        order:[['eff_date', 'DESC'], ['id', 'DESC']],
        where: {user_id: userId, eff_date: {[Op.lte]: end_date}}
    });
    let incentive = 0;
    if(curentStructure){
        sale_target = curentStructure.target ? parseFloat(curentStructure.target) : 0;
        visit_target = curentStructure.visit_target ? parseInt(curentStructure.visit_target) : 0;
        incentive = curentStructure.incentive ? priceFormat(curentStructure.incentive, true) : 0;
    }

    /* SUM() over no rows is NULL - return 0 so the API never hands out
       "sale_achived": null for a month with no collections */
    sale_achived = parseFloat(await PaymentModel.sum('amount', {where: {
        table_type: "sale",
        type: "credit",
        status: "success",
        payment_belongs: userId,
        ...getDateFromToWhere(start_date, end_date, 'payment_date')
    }})) || 0;

    visit_achived = await RetailerVisitModel.count({where: {user_id: userId, ...getDateFromToWhere(start_date, end_date)}});

    if(sale_target > 0){
        sale_achived_percent = (sale_achived / sale_target) * 100;
        sale_achived_percent = sale_achived_percent > 100 ? 100 : priceFormat(sale_achived_percent, true);
    }else if(sale_achived > 0){
        sale_achived_percent = 100;
    }
    if(visit_target > 0){
        visit_achived_percent = (visit_achived / visit_target) * 100;
        visit_achived_percent = visit_achived_percent > 100 ? 100 : priceFormat(visit_achived_percent, true);
    }else if(visit_achived > 0){
        visit_achived_percent = 100;
    }

    sale_due = sale_achived_percent == 100 ? 0 : priceFormat(sale_target - sale_achived, true);
    visit_due = visit_achived_percent == 100 ? 0 : (visit_target - visit_achived);
    let month = moment(start_date).format('MMM-YYYY');
    return {
        sale_achived: sale_achived,
        sale_achived_display: displayAmount(sale_achived),
        visit_achived: visit_achived,
        sale_achived_percent: sale_achived_percent,
        sale_achived_percent_display: sale_achived_percent + '%',
        visit_achived_percent: visit_achived_percent,
        visit_achived_percent_display: visit_achived_percent + '%',
        sale_due: sale_due,
        sale_due_display: displayAmount(sale_due),
        visit_due: visit_due,
        sale_target: sale_target,
        sale_target_display: displayAmount(sale_target),
        visit_target: visit_target,
        month: month,
        incentive: incentive

    };
}