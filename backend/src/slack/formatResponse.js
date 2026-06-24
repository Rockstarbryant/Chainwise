// slack/formatResponse.js
function toSlackBlocks(markdownText, toolsUsed = []) {
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: markdownText }
    }
  ];

  // Show which tools were used (great for transparency)
  if (toolsUsed.length > 0) {
    const toolNames = toolsUsed.map(t => `\`${t.tool}\``).join(', ');
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `🔧 Tools used: ${toolNames}`
      }]
    });
  }

  // Add a refresh button for live data queries
  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: '🔄 Refresh rates' },
      action_id: 'refresh_rates',
      value: markdownText.slice(0, 200) // pass context back
    }]
  });

  return blocks;
}

module.exports = { toSlackBlocks };