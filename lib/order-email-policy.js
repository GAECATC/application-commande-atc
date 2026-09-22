function shouldSendOrderUpdateEmail({ adminRequest, sendEmail }) {
  return !adminRequest || sendEmail === true;
}

module.exports = { shouldSendOrderUpdateEmail };
