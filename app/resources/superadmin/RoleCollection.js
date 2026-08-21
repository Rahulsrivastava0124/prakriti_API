const { isObject } = require("@helpers/helper");
const { geStatusValue, getRoleId } = require("@library/common");


const RoleCollection = async (data) => {
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

const getModelObject = async (data) => {
    let mangerRoleId = getRoleId('manager');
    let workerRoleId = getRoleId('worker');
    return {
        id: data.id,
        name: data.name,
        display_name: data.display_name,
        can_edit: ![mangerRoleId, workerRoleId].includes(data.id),
        can_delete: ![mangerRoleId, workerRoleId].includes(data.id)
    }
}

module.exports = {
    RoleCollection
}
