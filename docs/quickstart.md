# Quick Start
This guide provides a quick introduction to using AgentSpine (based on AgentZero). We'll cover launching the web UI, starting a new chat, and running a simple task.

## Launching the Web UI

### Using Docker (Recommended)

The easiest way to get started with AgentSpine is using Docker. Choose the build variant that matches your hardware:

**CPU-only Variant:**
```bash
docker pull ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu
docker run -p 50001:80 ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu
```

**Full GPU Variant (NVIDIA GPU required):**
```bash
docker pull ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-fullgpu
docker run --gpus all -p 50001:80 ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-fullgpu
```

**Hybrid GPU Variant:**
```bash
# Terminal 1: Start Kokoro worker
docker pull ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre-hybrid-gpu
docker run --gpus all -p 8001:8001 ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre-hybrid-gpu

# Terminal 2: Start main application
docker pull ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu
docker run -p 50001:80 -e TTS_KOKORO_REMOTE_URL=http://host.docker.internal:8001 ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu
```

After starting the container, open your web browser and navigate to `http://localhost:50001`. You should see the AgentSpine Web UI.

### Using Local Installation

1. Make sure you have AgentSpine installed and your environment set up correctly (refer to the [Installation guide](installation.md) if needed).
2. Open a terminal in the AgentSpine directory and activate your conda environment (if you're using one).
3. Run the following command:

```bash
python run_ui.py
```

4. A message similar to this will appear in your terminal, indicating the Web UI is running:

![](res/flask_link.png)

5. Open your web browser and navigate to the URL shown in the terminal (usually `http://127.0.0.1:50001`). You should see the AgentSpine Web UI.

![New Chat](res/ui_newchat1.png)

> [!TIP]
> As you can see, the Web UI has four distinct buttons for easy chat management: 
> `New Chat`, `Reset Chat`, `Save Chat`, and `Load Chat`.
> Chats can be saved and loaded individually in `json` format and are stored in the
> `/tmp/chats` directory.

    ![Chat Management](res/ui_chat_management.png)

## Running a Simple Task
Let's ask AgentSpine to download a YouTube video. Here's how:

1.  Type "Download a YouTube video for me" in the chat input field and press Enter or click the send button.

2. AgentSpine will process your request.  You'll see its "thoughts" and the actions it takes displayed in the UI. It will find a default already existing solution, that implies using the `code_execution_tool` to run a simple Python script to perform the task.

3. The agent will then ask you for the URL of the YouTube video you want to download.

## Example Interaction
Here's an example of what you might see in the Web UI at step 3:
![1](res/image-24.png)

## Next Steps
Now that you've run a simple task, you can experiment with more complex requests. Try asking AgentSpine to:

* Perform calculations
* Search the web for information
* Execute shell commands
* Explore web development tasks
* Create or modify files

> [!TIP]
> The [Usage Guide](usage.md) provides more in-depth information on using AgentSpine's various features, including prompt engineering, tool usage, and multi-agent cooperation.

## Custom Features in AgentSpine

AgentSpine includes several enhanced features not found in the original Agent Zero:

- **Enhanced Model Picker UI**: Improved dropdown with click-outside detection, history management, and remove buttons
- **MCP Toggle Panel**: Easy enable/disable of MCP servers with status feed
- **Enhanced Kokoro TTS Settings**: Compute/device selection, voice selection, and speed controls
- **Build Variants**: Choose between CPU-only, Full GPU, or Hybrid GPU builds based on your hardware
