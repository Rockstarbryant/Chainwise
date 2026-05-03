const Groq = require('groq-sdk');
const { tools, SYSTEM_PROMPT } = require('./tools');
const { executeTool } = require('./executor');
const logger = require('../../utils/logger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Best free Groq model with strong tool use support
const MODEL = 'llama-3.3-70b-versatile';

async function runAgent(messages) {
  // Build conversation in OpenAI format
  let conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const toolsUsed = [];
  let iterations = 0;
  const MAX_ITER = 5;

  let response = await groq.chat.completions.create({
    model: MODEL,
    messages: conversation,
    tools,
    tool_choice: 'auto',
    max_tokens: 4096,
    temperature: 0.3, // lower = more precise for fee/routing answers
  });

  // Agentic loop — keep going while model wants to call tools
  while (
    response.choices[0].finish_reason === 'tool_calls' &&
    iterations < MAX_ITER
  ) {
    iterations++;

    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];

    // Append assistant's tool_calls message to conversation
    conversation.push(assistantMessage);

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        const toolName = call.function.name;
        let input;

        try {
          input = JSON.parse(call.function.arguments);
        } catch {
          input = {};
        }

        logger.debug(`[agent] tool: ${toolName} | input: ${JSON.stringify(input)}`);

        const result = await executeTool(toolName, input);
        toolsUsed.push({ tool: toolName, input, result });

        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
      })
    );

    // Append tool results to conversation
    conversation.push(...toolResults);

    // Continue — let model process the tool results
    response = await groq.chat.completions.create({
      model: MODEL,
      messages: conversation,
      tools,
      tool_choice: 'auto',
      max_tokens: 4096,
      temperature: 0.3,
    });
  }

  const finalMessage = response.choices[0].message.content || 'No response generated.';

  return {
    message: finalMessage,
    toolsUsed,
    inputTokens:  response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

module.exports = { runAgent };