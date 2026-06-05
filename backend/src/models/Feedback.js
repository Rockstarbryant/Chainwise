const mongoose = require('mongoose');
 
const FeedbackSchema = new mongoose.Schema({
  conversationId: { type: String, default: null },
  messageIndex:   { type: Number, required: true },
  vote:           { type: String, enum: ['up', 'down'], required: true },
  message:        { type: String, default: '' },    // first 200 chars of response
  toolsUsed:      { type: [String], default: [] },  // which tools were called
  userId:         { type: String, default: null },  // from auth if available
  ip:             { type: String, default: null },
}, { timestamps: true });
 
module.exports = mongoose.model('Feedback', FeedbackSchema);