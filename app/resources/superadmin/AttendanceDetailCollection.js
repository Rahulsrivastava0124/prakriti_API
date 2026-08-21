const { isObject, formatDateTime, isEmpty, getFileAbsulatePath } = require("@helpers/helper");
const {getLoginLogoutAddress, getTodayAttendence} = require("@library/common");


const AttendanceDetailCollection = async(data) => {
    if(isObject(data)){
        return await getModelObject(data);
    }else{
        let arr = [];
        for(let i = 0; i < data.length; i++){
            arr.push(await getModelObject(data[i]));
        }
        return arr;
    }
}

const getModelObject = async(data) => {
    let display_explanation = '';
    if(!isEmpty(data.explanation)){
        display_explanation = data.explanation.charAt(0).toUpperCase() + data.explanation.slice(1);
    }
    let status = await getTodayAttendence(data.user, formatDateTime(data.createdAt, 10));
    let display_status = '';
    if(!isEmpty(status)){
        display_status = status.charAt(0).toUpperCase() + status.slice(1);
    }

    let attendence_address = await getLoginLogoutAddress(data.user_id, formatDateTime(data.createdAt, 10));

    return {
        id: data.id,
        user_id: !isEmpty(data.user_id) ? data.user_id: '',
        type: !isEmpty(data.type) ? data.type: '',
        city: !isEmpty(data.city) ? data.city: '',
        state: !isEmpty(data.state) ? data.state: '',
        country: !isEmpty(data.country) ? data.country: '',
        lat: !isEmpty(data.lat) ? data.lat: '',
        lng: !isEmpty(data.lng) ? data.lng: '',
        late_reason: !isEmpty(data.late_reason) ? data.late_reason: '',
        image: !isEmpty(data.image) ? getFileAbsulatePath(data.image): '',
        date: !isEmpty(data.createdAt) ? formatDateTime(data.createdAt, 10)    : '',
        display_date: !isEmpty(data.createdAt) ? formatDateTime(data.createdAt, 8)    : '',
        display_time: !isEmpty(data.createdAt) ? formatDateTime(data.createdAt, 6)    : '',
        explanation:  !isEmpty(data.late_reason) ? data.late_reason: '',
        status: status,
        display_status:display_status,
        attendence_address: attendence_address
    }
}

module.exports = {
    AttendanceDetailCollection
}
