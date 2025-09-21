document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const fileInput = document.getElementById('file-input');
    const translateButton = document.getElementById('translate-button');
    const languageSelect = document.getElementById('language-select');
    const resultsContainer = document.getElementById('results-container');
    const translatedOutput = document.getElementById('translated-output');
    const playButton = document.getElementById('play-button');
    const audioPlayer = document.getElementById('audio-player');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');

    function displayError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        loadingSpinner.style.display = 'none';
        resultsContainer.style.display = 'none';
    }

    // Handle file input to extract text
    fileInput.addEventListener('change', async(event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        const selectedLanguages = Array.from(languageSelect.selectedOptions).map(option => option.value);
        formData.append('languages', JSON.stringify(selectedLanguages));

        errorMessage.style.display = 'none';
        loadingSpinner.style.display = 'block';

        try {
            const response = await fetch('/api/start_translation', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                displayError(`Error uploading file: ${errorData.error}`);
                return;
            }

            const data = await response.json();
            if (data.task_id) {
                startPolling(data.task_id, selectedLanguages);
            } else {
                displayError("Failed to start translation task.");
            }

        } catch (error) {
            displayError(`Error uploading file: ${error.message}`);
        }
    });

    // Handle text input for translation
    translateButton.addEventListener('click', async(event) => {
        event.preventDefault();
        const textToTranslate = textInput.value.trim();
        const selectedLanguages = Array.from(languageSelect.selectedOptions).map(option => option.value);

        if (!textToTranslate || selectedLanguages.length === 0) {
            displayError("Please enter text and select at least one language.");
            return;
        }

        errorMessage.style.display = 'none';
        loadingSpinner.style.display = 'block';
        resultsContainer.style.display = 'none';

        try {
            const response = await fetch('/api/start_translation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: textToTranslate,
                    languages: selectedLanguages
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                displayError(`Translation error: ${errorData.error}`);
                return;
            }

            const data = await response.json();
            if (data.task_id) {
                startPolling(data.task_id, selectedLanguages);
            } else {
                displayError("Failed to start translation task.");
            }

        } catch (error) {
            displayError(`Error during translation: ${error.message}`);
        }
    });

    // Function to start polling the server for translation status
    function startPolling(taskId, selectedLanguages) {
        const intervalId = setInterval(async() => {
            try {
                const response = await fetch(`/api/translation_status/${taskId}`);
                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(intervalId);
                    loadingSpinner.style.display = 'none';
                    displayTranslations(data.result.translations, selectedLanguages);
                } else if (data.status === 'failed' || data.status === 'not_found') {
                    clearInterval(intervalId);
                    displayError(data.result ? data.result.error : 'Translation failed. Please try again.');
                }
            } catch (error) {
                clearInterval(intervalId);
                displayError('Polling error: Could not retrieve translation status.');
            }
        }, 2000); // Poll every 2 seconds
    }

    // Function to display the translated text
    function displayTranslations(translations, languages) {
        translatedOutput.innerHTML = ''; // Clear previous results
        languages.forEach(lang => {
            const translation = translations[lang];
            if (translation && translation.translated) {
                const languageName = getLanguageName(lang);
                translatedOutput.innerHTML += `<h4>${languageName}:</h4><p>${translation.translated}</p><hr>`;
            } else {
                translatedOutput.innerHTML += `<p>Error translating to ${getLanguageName(lang)}.</p>`;
            }
        });
        resultsContainer.style.display = 'block';
    }

    function getLanguageName(langCode) {
        const languages = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh-CN': 'Chinese (Simplified)',
            'zh-TW': 'Chinese (Traditional)',
            'hi': 'Hindi'
        };
        return languages[langCode] || langCode;
    }

    // Handle text-to-speech
    playButton.addEventListener('click', async() => {
        const textToSpeak = translatedOutput.innerText;
        const lang = languageSelect.value;
        if (!textToSpeak || !lang) {
            return;
        }

        try {
            const response = await fetch('/api/text-to-speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    lang: lang
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Text-to-speech error:', errorData.error);
                return;
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayer.src = audioUrl;
            audioPlayer.style.display = 'block';
            audioPlayer.play();
        } catch (error) {
            console.error('Error during text-to-speech:', error);
        }
    });
});