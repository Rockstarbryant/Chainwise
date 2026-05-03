const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  toolsUsed: [{ type: mongoose.Schema.Types.Mixed }],
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true }, // Supabase user UUID
  title:     { type: String, default: 'New Conversation' },
  messages:  [MessageSchema],
  messageCount: { type: Number, default: 0 },
  lastActive:   { type: Date, default: Date.now },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

// Auto-generate title from first user message
ConversationSchema.pre('save', function (next) {
  if (this.messages.length > 0 && this.title === 'New Conversation') {
    const first = this.messages.find(m => m.role === 'user');
    if (first) {
      this.title = first.content.slice(0, 60) + (first.content.length > 60 ? '...' : '');
    }
  }
  this.messageCount = this.messages.length;
  this.lastActive   = new Date();
  next();
});

ConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', ConversationSchema);