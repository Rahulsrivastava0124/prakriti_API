module.exports = {
    employee_login_from: '09:00:00',
    employee_login_to: '12:30:00',

    // team/employee auth token expires at this time (IST) on the next occurrence.
    // After this time anyone with the token is rejected (401) and must re-login.
    employee_token_expire_at: '08:59:59'

}