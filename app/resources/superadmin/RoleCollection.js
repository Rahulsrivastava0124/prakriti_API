const {
  mapConcurrent, isObject } = require("@helpers/helper");
const { geStatusValue, getRoleId } = require("@library/common");


const RoleCollection = async (data) => {
    if(isObject(data)){
        return await getModelObject(data);
    }else{
        return await mapConcurrent(data, (item, i) => getModelObject(item));

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
