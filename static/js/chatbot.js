document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    // Add message to chat window
    function addMessage(text, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.style.display = 'flex';
        messageDiv.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
        messageDiv.style.marginBottom = '1rem';

        const innerMessage = document.createElement('div');
        innerMessage.style.backgroundColor = isUser ? '#d1e5ff' : '#e5e7eb';
        innerMessage.style.padding = '0.75rem 1rem';
        innerMessage.style.borderRadius = isUser ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0';
        innerMessage.style.maxWidth = '80%';
        innerMessage.style.wordWrap = 'break-word';
        innerMessage.textContent = text;

        messageDiv.appendChild(innerMessage);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Show loading state on button
    function addLoadingState(button, loadingText) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = loadingText;
        return () => {
            button.disabled = false;
            button.textContent = originalText;
        };
    }

    // Send message to backend
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) {
            alert("Please enter a message before sending.");
            return;
        }

        addMessage(message, true);
        chatInput.value = '';

        const revertButton = addLoadingState(chatSend, 'Sending...');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: message })
            });

            const data = await response.json();

            if (response.ok) {
                addMessage(data.response || 'No response received', false);
            } else {
                addMessage(`Error: ${data.error}`, false);
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage(`Error: ${error.message}`, false);
        } finally {
            revertButton();
        }
    }

    // Button click handler
    chatSend.addEventListener('click', sendMessage);

    // Enter key handler
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});