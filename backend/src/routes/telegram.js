const express = require('express');
const router = express.Router();
const telegramBot = require('../telegram/bot');

router.post('/webhook', (req, res) => {
  try {
    telegramBot.bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;