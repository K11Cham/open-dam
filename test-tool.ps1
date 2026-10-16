$systemMsg = @"
When calling a tool, you MUST wrap the call exactly as:
<tool_call>
{"name": "<function-name>", "arguments": <args-json-object>}
</tool_call>
Never output tool call JSON without these tags.
"@

$body = @{
    model = "qwen2.5-coder:7b"
    messages = @(
        @{ role = "system"; content = $systemMsg }
        @{ role = "user"; content = "list files in the current directory" }
    )
    tools = @(@{
        type = "function"
        function = @{
            name = "list_files"
            description = "List files in a directory"
            parameters = @{
                type = "object"
                properties = @{ path = @{ type = "string" } }
            }
        }
    })
    stream = $false
    options = @{ temperature = 0 }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri http://localhost:11434/api/chat -Method Post -Body $body -ContentType "application/json"