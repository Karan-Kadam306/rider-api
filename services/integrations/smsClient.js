// Mock of the SMS provider that sends rider sign-in codes.
// The real client calls the provider's API with the same arguments. The mock only logs the code
// (quietly during tests), so in development read it from the API log.

async function sendOtp(phone, code) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[mock sms] OTP for ******${phone.slice(-4)}: ${code}`);
    }
}

module.exports = { sendOtp };
