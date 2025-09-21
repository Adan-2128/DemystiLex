// static/js/script.js

document.addEventListener('DOMContentLoaded', function() {
    // This is your smooth-scrolling logic, left unchanged as you requested.
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});

// Removed the duplicate definition of this function.
function addLoadingState(button, loadingText) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingText;
    return () => {
        button.disabled = false;
        button.innerHTML = originalText;
    };
}

// Corrected Text-to-Speech function. The code inside was fine,
// but the syntax error in the file prevented it from working.
async function handleSpeakButtonClick() {
    const textToSpeak = document.getElementById('explanation-text').innerText;

    if (!textToSpeak) {
        console.error("No text to speak.");
        alert("There is no explanation text to speak.");
        return;
    }

    try {
        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: textToSpeak }),
        });

        if (!response.ok) {
            console.error("Failed to fetch audio. Status:", response.status);
            alert("Sorry, text-to-speech failed on the server.");
            return;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();

    } catch (error) {
        console.error('Error during text-to-speech:', error);
        alert("Sorry, text-to-speech is currently unavailable.");
    }
}

// CRITICAL FIX: The extra '}' that was here has been removed.