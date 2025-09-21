document.addEventListener('DOMContentLoaded', () => {
    // Get all required elements from the DOM
    const demystifyButton = document.getElementById('demystify-button');
    const textInput = document.getElementById('text-input');
    const fileInput = document.getElementById('file-input');
    const resultsContainer = document.getElementById('results-container');
    const explanationOutput = document.getElementById('explanation-output');
    const mindmapContainer = document.getElementById('mindmap');
    const feedbackMessage = document.getElementById('feedback-message');

    // Utility function to display feedback messages
    function showFeedback(message, isSuccess = false) {
        feedbackMessage.textContent = message;
        feedbackMessage.style.display = 'block';
        feedbackMessage.style.color = isSuccess ? '#10b981' : '#ef4444';
        setTimeout(() => {
            feedbackMessage.style.display = 'none';
        }, 5000);
    }

    // Utility function to handle button loading state
    function addLoadingState(button, loadingText) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
        return () => {
            button.textContent = button.dataset.originalText;
            button.disabled = false;
        };
    }

    // Add event listener to the demystify button
    if (demystifyButton) {
        demystifyButton.addEventListener('click', async(event) => {
            event.preventDefault();
            const textToDemystify = textInput.value.trim();
            const fileToDemystify = fileInput.files[0];

            if (!textToDemystify && !fileToDemystify) {
                showFeedback('Please enter text or upload a file.');
                return;
            }

            const revertButton = addLoadingState(demystifyButton, 'Demystifying...');
            resultsContainer.style.display = 'none';

            try {
                const formData = new FormData();
                if (fileToDemystify) {
                    formData.append('file', fileToDemystify);
                } else {
                    formData.append('text', textToDemystify);
                }

                const response = await fetch('/api/demystify', {
                    method: 'POST',
                    body: formData
                });

                const contentType = response.headers.get("content-type");

                // Check if the response is HTML, indicating a redirect to the login page
                if (contentType && contentType.indexOf("text/html") !== -1) {
                    window.location.href = '/login';
                    return;
                }

                // If the response is not successful, handle the error
                if (!response.ok) {
                    const errorData = await response.json();
                    showFeedback(errorData.error || 'An unexpected error occurred.');
                    return;
                }

                // The response is good, so parse the JSON
                const data = await response.json();

                // Update the output with the demystified content
                explanationOutput.innerText = data.explanation || 'No explanation returned';
                if (data.mindmap_data) {
                    // Assuming renderMindMap function is defined in mindmap.js
                    renderMindMap(mindmapContainer, data.mindmap_data);
                } else {
                    mindmapContainer.innerHTML = '<p>No mind map could be generated for this document.</p>';
                }
                resultsContainer.style.display = 'block';
                showFeedback('Demystification successful!', true);

            } catch (error) {
                console.error('Error during demystification:', error);
                showFeedback(`Error: Unable to connect to the server. ${error.message}`);
            } finally {
                revertButton();
            }
        });
    } else {
        console.error("Demystify button not found in the DOM.");
    }
});