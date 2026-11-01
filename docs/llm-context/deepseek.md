<!-- source: https://api-docs.deepseek.com (pages named below, served as .md)
     fetched: 2026-11-01 -->

# DeepSeek API, relevant parts

## Confirmed from the official docs

| Item | Value |
|---|---|
| Models | `deepseek-flash` (DeepSeek-V4.1-Flash-1017), `deepseek-v4-pro` (DeepSeek-V4-Pro-0813) |
| Legacy names | `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted and served by Flash |
| Base URL | `https://api.deepseek.com` |
| Beta base URL | `https://api.deepseek.com/beta`, required for `strict` tools |
| JSON mode | `response_format: {type: "json_object"}`. The prompt must say "json" and show the format. Content can come back blank and needs a retry |
| Tool calling | OpenAI format (`tools`, `tool_calls`, role `tool`) |
| Strict tools | Yes (Beta). Every property required, `additionalProperties: false`. Listed types: object, string, number, integer, boolean, array, enum, anyOf. `null` is **not** listed; `minLength`, `maxLength`, `minItems`, `maxItems` are unsupported |
| Forced tool | `required` and named `tool_choice` return 400 in thinking mode, which is the default. Disable thinking first |
| Thinking | On by default. Effort via `reasoning_effort` (`low`, `high`, `max`; `medium` maps to `high`). On requests with `tools`, `reasoning_content` must be passed back or the API returns 400 |
| Image input | `deepseek-flash` only (JPEG, PNG, GIF, WebP as `image_url`). No PDF input. `deepseek-v4-pro` has no vision |
| Errors | 400, 401, 402 (balance), 422, 429, 500, 503 |
| Price, per MTok | Flash: $0.30 in / $1.20 out at peak, half off-peak. V4 Pro: $1.32 in / $3.96 out at peak, half off-peak. Peak = 01:00–04:00 and 06:00–10:00 UTC, Mon–Fri |

## Confirmed live (2026-11-01)

- `GET https://api.deepseek.com/models` lists `deepseek-flash` (text, image input) and `deepseek-v4-pro` (text input), both with effort levels `low`, `high`, `max`.
- `strict` accepts `{"type": "null"}` inside `anyOf`, even though the docs do not list it: our nullable invoice schema worked on `deepseek-flash` with thinking disabled.

---

# Models & Pricing

Model prices are listed in units of per 1M tokens. A token, the smallest unit of text that the model recognizes, can be a word, a number, or even a punctuation mark. We bill model usage based on the total number of input and output tokens by the model.

***

## Model Details

| MODEL                       | MODEL                                                                                          | MODEL                                                                                          | deepseek-flash(1)                                                                                                                                      | deepseek-v4-pro                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BASE URL (OpenAI Format)    | BASE URL (OpenAI Format)                                                                       | BASE URL (OpenAI Format)                                                                       | <https://api.deepseek.com>                                                                                                                             | <https://api.deepseek.com>                                                                                                                             |
| BASE URL (Anthropic Format) | BASE URL (Anthropic Format)                                                                    | BASE URL (Anthropic Format)                                                                    | <https://api.deepseek.com/anthropic>                                                                                                                   | <https://api.deepseek.com/anthropic>                                                                                                                   |
| MODEL VERSION               | MODEL VERSION                                                                                  | MODEL VERSION                                                                                  | DeepSeek-V4.1-Flash-1017                                                                                                                               | DeepSeek-V4-Pro-0813                                                                                                                                   |
| THINKING MODE               | THINKING MODE                                                                                  | THINKING MODE                                                                                  | Supports both non-thinking and thinking (default) modes / See [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode.md) for how to switch | Supports both non-thinking and thinking (default) modes / See [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode.md) for how to switch |
| CONTEXT LENGTH              | CONTEXT LENGTH                                                                                 | CONTEXT LENGTH                                                                                 | 1M                                                                                                                                                     | 1M                                                                                                                                                     |
| MAX OUTPUT                  | MAX OUTPUT                                                                                     | MAX OUTPUT                                                                                     | MAXIMUM: 384K                                                                                                                                          | MAXIMUM: 384K                                                                                                                                          |
| FEATURES                    | [Json Output](https://api-docs.deepseek.com/guides/json_mode.md)                               | [Json Output](https://api-docs.deepseek.com/guides/json_mode.md)                               | ✓                                                                                                                                                      | ✓                                                                                                                                                      |
| FEATURES                    | [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls.md)                               | [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls.md)                               | ✓                                                                                                                                                      | ✓                                                                                                                                                      |
| FEATURES                    | [Responses API](https://api-docs.deepseek.com/guides/responses_api.md)                         | [Responses API](https://api-docs.deepseek.com/guides/responses_api.md)                         | ✓                                                                                                                                                      | ✓                                                                                                                                                      |
| FEATURES                    | [Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api.md)                         | [Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api.md)                         | ✓                                                                                                                                                      | ✓                                                                                                                                                      |
| FEATURES                    | [Chat Prefix Completion（Beta）](https://api-docs.deepseek.com/guides/chat_prefix_completion.md) | [Chat Prefix Completion（Beta）](https://api-docs.deepseek.com/guides/chat_prefix_completion.md) | ✓                                                                                                                                                      | ✓                                                                                                                                                      |
| FEATURES                    | [FIM Completion（Beta）](https://api-docs.deepseek.com/guides/fim_completion.md)                 | [FIM Completion（Beta）](https://api-docs.deepseek.com/guides/fim_completion.md)                 | Non-thinking mode only                                                                                                                                 | Non-thinking mode only                                                                                                                                 |
| FEATURES                    | [Vision](https://api-docs.deepseek.com/guides/vision.md)                                       | [Vision](https://api-docs.deepseek.com/guides/vision.md)                                       | ✓                                                                                                                                                      | Not supported                                                                                                                                          |
| PRICING(2)                  | 1M INPUT TOKENS / (CACHE HIT)                                                                  | OFF-PEAK                                                                                       | $0.003                                                                                                                                                 | $0.022                                                                                                                                                 |
| PRICING(2)                  | 1M INPUT TOKENS / (CACHE HIT)                                                                  | PEAK                                                                                           | $0.006                                                                                                                                                 | $0.044                                                                                                                                                 |
| PRICING(2)                  | 1M INPUT TOKENS / (CACHE MISS)                                                                 | OFF-PEAK                                                                                       | $0.15                                                                                                                                                  | $0.66                                                                                                                                                  |
| PRICING(2)                  | 1M INPUT TOKENS / (CACHE MISS)                                                                 | PEAK                                                                                           | $0.3                                                                                                                                                   | $1.32                                                                                                                                                  |
| PRICING(2)                  | 1M OUTPUT TOKENS                                                                               | OFF-PEAK                                                                                       | $0.6                                                                                                                                                   | $1.98                                                                                                                                                  |
| PRICING(2)                  | 1M OUTPUT TOKENS                                                                               | PEAK                                                                                           | $1.2                                                                                                                                                   | $3.96                                                                                                                                                  |
| Concurrency Limit(3)        | Concurrency Limit(3)                                                                           | Concurrency Limit(3)                                                                           | 2500                                                                                                                                                   | 500                                                                                                                                                    |

(1) Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted, but the corresponding models have been retired, their requests are served by the DeepSeek-V4.1-Flash-1017 model and billed at the Flash price.

(2) Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including weekends and Chinese public holidays in full.

(3) For more details on concurrency limits, please refer to [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit.md).

***

## Search & Fetch Pricing

Search and Fetch are standalone APIs billed per request.

| API    | Unit                          | Price |
| ------ | ----------------------------- | ----- |
| Search | Per 1,000 successful requests | $0.75 |
| Fetch  | Per 1,000 successful requests | $0.75 |

Note: when you use the DeepSeek API through DeepSeek Harness, Claude Code, or Codex, server-side tool calls already hit the Search and Fetch APIs. These calls are currently free of charge; per-request billing starts at 00:00 Beijing time on November 1, 2026.

See the [Search & Fetch guide](https://api-docs.deepseek.com/guides/search.md) for API usage and complete billing rules.

***

## Deduction Rules

For model usage, the expense = number of tokens × price. Search and Fetch are charged per successful request at the rates above.
The corresponding fees will be directly deducted from your topped-up balance or granted balance, with a preference for using the granted balance first when both balances are available.

Product prices may vary and DeepSeek reserves the right to adjust them. We recommend topping up based on your actual usage and regularly checking this page for the most recent pricing information.

---

# JSON Output

In many scenarios, users need the model to output in strict JSON format to achieve structured output, facilitating subsequent parsing.

DeepSeek provides JSON Output to ensure the model outputs valid JSON strings.

## Notice

To enable JSON Output, users should:

1. Set the `response_format` parameter to `{'type': 'json_object'}`.
2. Include the word "json" in the system or user prompt, and provide an example of the desired JSON format to guide the model in outputting valid JSON.
3. Set the `max_tokens` parameter reasonably to prevent the JSON string from being truncated midway.
4. **When using the JSON Output feature, if the model's output cannot be recognized as JSON, the API replaces the non-JSON content with spaces (`U+0020`). As a result, the returned `content` may contain only spaces (appearing empty, even when `finish_reason` is `stop`). You can try modifying the prompt to mitigate such problems, and handle blank `content` in your code (e.g., retry the request).**

## Sample Code

Here is the complete Python code demonstrating the use of JSON Output:

```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

system_prompt = """
The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format. 

EXAMPLE INPUT: 
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{
    "question": "Which is the highest mountain in the world?",
    "answer": "Mount Everest"
}
"""

user_prompt = "Which is the longest river in the world? The Nile River."

messages = [{"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}]

response = client.chat.completions.create(
    model="deepseek-flash",
    messages=messages,
    response_format={
        'type': 'json_object',
    },
)

print(json.loads(response.choices[0].message.content))
```

The model will output:

```
{
    "question": "Which is the longest river in the world?",
    "answer": "The Nile River"
}
```

---

# Tool Calls

Tool Calls allows the model to call external tools to enhance its capabilities.

***

## Non-thinking Mode

### Sample Code

Here is an example of using Tool Calls to get the current weather information of the user's location, demonstrated with complete Python code.

For the specific API format of Tool Calls, please refer to the [Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion.md) documentation.

```python
from openai import OpenAI

def send_messages(messages):
    response = client.chat.completions.create(
        model="deepseek-flash",
        messages=messages,
        tools=tools,
        extra_body={"thinking": {"type": "disabled"}},
    )
    return response.choices[0].message

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location, the user should supply a location first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    },
                },
                "required": ["location"],
            },
        },
    },
]

messages = [{"role": "user", "content": "How's the weather in Hangzhou, Zhejiang?"}]
message = send_messages(messages)
print(f"User>\t {messages[0]['content']}")

tool = message.tool_calls[0]
messages.append(message)

messages.append({"role": "tool", "tool_call_id": tool.id, "content": "24℃"})
message = send_messages(messages)
print(f"Model>\t {message.content}")
```

The execution flow of this example is as follows:

1. User: Asks about the current weather in Hangzhou
2. Model: Returns the function `get_weather({location: 'Hangzhou'})`
3. User: Calls the function `get_weather({location: 'Hangzhou'})` and provides the result to the model
4. Model: Returns in natural language, "The current temperature in Hangzhou is 24°C."

Note: In the above code, the functionality of the `get_weather` function needs to be provided by the user. The model itself does not execute specific functions.

***

## Thinking Mode

From DeepSeek-V3.2, the API supports tool use in the thinking mode. For more details, please refer to [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode.md#tool-calls).

***

## Inserting Tool Calls Mid-Conversation

In some agent scenarios, the client needs to dynamically insert tool calls that were not generated by the model — together with their results — into the middle of the conversation history. Support for this differs across API formats:

- The [Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api.md) (`/messages`) and the [Responses API](https://api-docs.deepseek.com/guides/responses_api.md) support inserting tool call messages mid-conversation, and also support inserting `system` messages mid-conversation.
- The Chat Completion API does not support inserting tool calls mid-conversation but does support inserting `system` messages mid-conversation; to insert tool calls, use the Anthropic API or the Responses API instead.

***

## `strict` Mode (Beta)

In `strict` mode, the model strictly adheres to the format requirements of the Function's JSON schema when outputting a tool call, ensuring that the model's output complies with the user's definition. It is supported by both thinking and non-thinking mode.

To use `strict` mode, you need to:：

1. Use `base_url="https://api.deepseek.com/beta"` to enable Beta features
2. In the `tools` parameter，all `function` need to set the  `strict` property to `true`
3. The server will validate the JSON Schema of the Function provided by the user. If the schema does not conform to the specifications or contains JSON schema types that are not supported by the server, an error message will be returned

The following is an example of a tool definition in the  `strict` mode:

```json
{
    "type": "function",
    "function": {
        "name": "get_weather",
        "strict": true,
        "description": "Get weather of a location, the user should supply a location first.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA"
                }
            },
            "required": ["location"],
            "additionalProperties": false
        }
    }
}
```

***

### Support Json Schema Types In `strict` Mode

- object
- string
- number
- integer
- boolean
- array
- enum
- anyOf

***

#### object

The `object` defines a nested structure containing key-value pairs, where `properties` specifies the schema for each key (or property) within the object. **All properties of every `object` must be set as `required`, and the `additionalProperties` attribute of the `object` must be set to `false`.**

Example：

```json
{
    "type": "object",
    "properties": {
        "name": { "type": "string" },
        "age": { "type": "integer" }
    },
    "required": ["name", "age"],
    "additionalProperties": false
}
```

***

#### string

- Supported parameters:
  - `pattern`: Uses regular expressions to constrain the format of the string
  - `format`: Validates the string against predefined common formats. Currently supported formats:
    - `email`: Email address
    - `hostname`: Hostname
    - `ipv4`: IPv4 address
    - `ipv6`: IPv6 address
    - `uuid`: UUID

- Unsupported parameters:
  - `minLength`
  - `maxLength`

Example:

```json
{
    "type": "object",
    "properties": {
        "user_email": {
            "type": "string",
            "description": "The user's email address",
            "format": "email" 
        },
        "zip_code": {
            "type": "string",
            "description": "Six digit postal code",
            "pattern": "^\\d{6}$"
        }
    }
}
```

***

#### number/integer

- Supported parameters:
  - `const`: Specifies a constant numeric value
  - `default`: Defines the default value of the number
  - `minimum`: Specifies the minimum value
  - `maximum`: Specifies the maximum value
  - `exclusiveMinimum`: Defines a value that the number must be greater than
  - `exclusiveMaximum`: Defines a value that the number must be less than
  - `multipleOf`: Ensures that the number is a multiple of the specified value

Example:

```
{
    "type": "object",
    "properties": {
        "score": {
            "type": "integer",
            "description": "A number from 1-5, which represents your rating, the higher, the better",
            "minimum": 1,
            "maximum": 5
        }
    },
    "required": ["score"],
    "additionalProperties": false
}
```

***

#### array

- Unsupported parameters:
  - minItems
  - maxItems

Example：

```json
{
    "type": "object",
    "properties": {
        "keywords": {
            "type": "array",
            "description": "Five keywords of the article, sorted by importance",
            "items": {
                "type": "string",
                "description": "A concise and accurate keyword or phrase."
            }
        }
    },
    "required": ["keywords"],
    "additionalProperties": false
}
```

***

#### enum

The `enum` ensures that the output is one of the predefined options. For example, in the case of order status, it can only be one of a limited set of specified states.

Example：

```
{
    "type": "object",
    "properties": {
        "order_status": {
            "type": "string",
            "description": "Ordering status",
            "enum": ["pending", "processing", "shipped", "cancelled"]
        }
    }
}
```

***

#### anyOf

Matches any one of the provided schemas, allowing fields to accommodate multiple valid formats. For example, a user's account could be either an email address or a phone number:

```json
{
    "type": "object",
    "properties": {
    "account": {
        "anyOf": [
            { "type": "string", "format": "email", "description": "可以是电子邮件地址" },
            { "type": "string", "pattern": "^\\d{11}$", "description": "或11位手机号码" }
        ]
    }
  }
}
```

***

#### $ref and $def

You can use `$def` to define reusable modules and then use `$ref` to reference them, reducing schema repetition and enabling modularization. Additionally, `$ref` can be used independently to define recursive structures.

```json
{
    "type": "object",
    "properties": {
        "report_date": {
            "type": "string",
            "description": "The date when the report was published"
        },
        "authors": {
            "type": "array",
            "description": "The authors of the report",
            "items": {
                "$ref": "#/$def/author"
            }
        }
    },
    "required": ["report_date", "authors"],
    "additionalProperties": false,
    "$def": {
        "author": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "author's name"
                },
                "institution": {
                    "type": "string",
                    "description": "author's institution"
                },
                "email": {
                    "type": "string",
                    "format": "email",
                    "description": "author's email"
                }
            },
            "additionalProperties": false,
            "required": ["name", "institution", "email"]
        }
    }
}
```

---

# Tool choice (from the Chat Completion reference)

### schema-chat-completion-tool-choice-option

**ChatCompletionToolChoiceOption** — `#/components/schemas/ChatCompletionToolChoiceOption`

Controls which (if any) tool is called by the model.

`none` means the model will not call any tool and instead generates a message.

`auto` means the model can pick between generating a message or calling one or more tools.

`required` means the model must call one or more tools.

Specifying a particular tool via `{"type": "function", "function": {"name": "my_function"}}` forces the model to call that tool.

`none` is the default when no tools are present. `auto` is the default if tools are present.

`required` and named tool choices are not supported in thinking mode; the API returns a `400` error. Disable thinking mode first to use them.

- `type`: `["string","object"]`

- `nullable`: `true`

- **oneOf**

  - oneOf 1

    - Reference: [ChatCompletionToolChoice](#schema-chat-completion-tool-choice) (`#/components/schemas/ChatCompletionToolChoice`)

  - oneOf 2

    - Reference: [ChatCompletionNamedToolChoice](#schema-chat-completion-named-tool-choice) (`#/components/schemas/ChatCompletionNamedToolChoice`)

---

# Thinking mode (first part)

# Thinking Mode

The DeepSeek model supports the thinking mode: before outputting the final answer, the model will first output a chain-of-thought reasoning to improve the accuracy of the final response.

## Thinking Mode Toggle and Effort Control

|                            | Control Parameter (OpenAI Format)            | Control Parameter (Anthropic Format)            | Control Parameter (Responses API Format)                                           |
| -------------------------- | -------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Thinking Mode Toggle(1)    | `{"thinking": {"type": "enabled/disabled"}}` | `{"thinking": {"type": "enabled/disabled"}}`    | `{"reasoning": {"effort": "none/low/high/max"}}` / (`none` disables thinking mode) |
| Thinking Effort Control(2) | `{"reasoning_effort": "low/high/max"}`       | `{"output_config": {"effort": "low/high/max"}}` | `{"reasoning": {"effort": "none/low/high/max"}}` / (`none` disables thinking mode) |

(1) Thinking mode is enabled by default, with the default effort being `high` /&#x20;
(2) The mapping between the effort set by the user and the model's actual reasoning effort is as follows:

| Requested effort | Actual mapped effort |
| ---------------- | -------------------- |
| minimal          | low                  |
| low              | low                  |
| medium           | high                 |
| high             | high                 |
| xhigh            | high                 |
| max              | max                  |
| ultra            | max                  |

When using Chat Completion with the OpenAI SDK to set the `thinking` parameter, you need to pass the `thinking` parameter within `extra_body`:

```python
response = client.chat.completions.create(
  model="deepseek-flash",
  # ...
  reasoning_effort="high",
  extra_body={"thinking": {"type": "enabled"}},
)
```

## Input and Output Parameters

Thinking mode does not support the `temperature`, `presence_penalty`, or `frequency_penalty` parameters. Please note that, for compatibility with existing software, setting these parameters will not trigger an error but will also have no effect.

`top_p` behavior depends on the model:

- `deepseek-flash`: only takes effect in thinking mode, where the effective range is `0.95`–`1.0`; values below `0.95` are treated as `0.95`. In non-thinking mode it is fixed at `1.0` and your value is ignored.
- `deepseek-v4-pro`: in thinking mode your value is ignored (fixed at `0.95` when tool calling is enabled, otherwise `1.0`); in non-thinking mode it takes effect. Setting `tool_choice` to `none` disables tool calling even when `tools` is provided.

In thinking mode, the chain-of-thought content is returned via the `reasoning_content` parameter, at the same level as `content`. In subsequent requests, whether `reasoning_content` should be passed back and whether it will be concatenated into the context depends on whether the request carries the `tools` parameter:

- If the request **carries the `tools` parameter**: the `reasoning_content` of all previous turns should be passed back to the API and will be concatenated into the context. See [Tool Calls](#tool-calls) for details.
- If the request **does not carry the `tools` parameter**: `reasoning_content` does not need to be passed back; even if passed to the API, it will be ignored and will not be concatenated into the context. See [Multi-turn Conversation](#multi-turn-conversation) for details.

---

# Vision (first part)

# Vision

The `deepseek-flash` model accepts images alongside text, so you can ask the model to describe pictures, read text from screenshots, analyze charts, and more. The legacy model name `deepseek-v4-flash-vision-exp` is still accepted, but the model has been retired and its requests are served by the latest Flash model as well.

Supported image formats: **JPEG, PNG, GIF, and WebP**. The format is detected from the actual file content, not from the file name or the declared MIME type.

***

---

# Error Codes

When calling DeepSeek API, you may encounter errors. Here list the causes and solutions.

|                     CODE                     | DESCRIPTION                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 - Invalid Format                         | **Cause**: Invalid request body format.  /  **Solution**: Please modify your request body according to the hints in the error message. For more API format details, please refer to [DeepSeek API Docs.](https://api-docs.deepseek.com/quick_start/your_first_api_call.md)                    |
| 401 - Authentication Fails                   | **Cause**: Authentication fails due to the wrong API key.  /  **Solution**: Please check your API key. If you don't have one, please [create an API key](https://platform.deepseek.com/api_keys) first.                                                                                       |
| 402 - Insufficient Balance                   | **Cause**: You have run out of balance.  /  **Solution**: Please check your account's balance, and go to the [Top up](https://platform.deepseek.com/top_up) page to add funds.                                                                                                                |
| 422 - Invalid Parameters                     | **Cause**: Your request contains invalid parameters.  /  **Solution**: Please modify your request parameters according to the hints in the error message. For more API format details, please refer to [DeepSeek API Docs.](https://api-docs.deepseek.com/quick_start/your_first_api_call.md) |
| 429 - Rate Limit Reached                     | **Cause**: You are sending requests too quickly, or have exceeded a concurrency or QPS limit.  /  **Solution**: Please pace your requests reasonably. For model rate limits, see [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit.md).                           |
| 500 - Server Error                           | **Cause**: Our server encounters an issue.  /  **Solution**: Please retry your request after a brief wait and contact us if the issue persists.                                                                                                                                               |
| 503 - Server Overloaded                      | **Cause**: The server is overloaded due to high traffic.  /  **Solution**: Please retry your request after a brief wait.                                                                                                                                                                      |
