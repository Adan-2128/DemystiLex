document.addEventListener('DOMContentLoaded', () => {

            // --- E-Stamp Number Finder Logic ---
            const verifyEstampButton = document.getElementById('verify-estamp-button');
            if (verifyEstampButton) {
                verifyEstampButton.addEventListener('click', async() => {
                    const estampFileInput = document.getElementById('estamp-file-input');
                    const estampResults = document.getElementById('estamp-results');
                    if (!estampFileInput.files[0]) {
                        return alert('Please upload a file to find the E-Stamp number.');
                    }
                    const revert = addLoadingState(verifyEstampButton, 'Finding...');
                    estampResults.style.display = 'none';
                    const formData = new FormData();
                    formData.append('file', estampFileInput.files[0]);
                    try {
                        const response = await fetch('/api/verify_estamp', { method: 'POST', body: formData });
                        const data = await response.json();
                        estampResults.style.display = 'block';
                        if (response.ok && data.status === 'found') {
                            estampResults.innerHTML = `
                        <h4 class="result-success"><i class="fas fa-check-circle"></i> Number Found!</h4>
                        <p><strong>E-Stamp UIN:</strong> ${data.uin}</p>
                        <p style="margin-top: 0.5rem;">Click the link below to verify this number on the official government portal.</p>
                        <a href="${data.verification_url}" target="_blank" class="btn-primary" style="margin-top: 1rem;">Verify on SHCIL Website</a>
                    `;
                        } else {
                            estampResults.innerHTML = `<h4 class="result-fail"><i class="fas fa-times-circle"></i> Not Found</h4><p>${data.reason || data.error}</p>`;
                        }
                    } catch (error) {
                        estampResults.style.display = 'block';
                        estampResults.innerHTML = `<h4 class="result-fail">Error</h4><p>${error.message}</p>`;
                    } finally {
                        revert();
                    }
                });
            }

            // --- Clause Comparison Logic ---
            const compareClausesButton = document.getElementById('compare-clauses-button');
            if (compareClausesButton) {
                compareClausesButton.addEventListener('click', async() => {
                    const clauseTextInput = document.getElementById('clause-text-input');
                    const clauseResults = document.getElementById('clause-results');
                    if (!clauseTextInput.value.trim()) {
                        return alert('Please paste the document text to analyze.');
                    }
                    const revert = addLoadingState(compareClausesButton, 'Analyzing...');
                    clauseResults.style.display = 'none';
                    try {
                        const response = await fetch('/api/compare_clauses', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: clauseTextInput.value.trim() })
                        });
                        const data = await response.json();
                        clauseResults.style.display = 'block';
                        if (response.ok) {
                            const createList = (items) => {
                                if (!items || items.length === 0) return '<li>None found.</li>';
                                return items.map(item => `<li>${item}</li>`).join('');
                            };
                            clauseResults.innerHTML = `
                        <h4 class="card-title" style="font-size: 1.2rem;">Analysis Complete</h4>
                        <p><strong>Overall Summary:</strong> ${data.summary || 'No summary provided.'}</p>
                        <hr>
                        <p><strong><i class="fas fa-exclamation-triangle"></i> Potentially Risky Clauses for Tenant:</strong></p>
                        <ul>${createList(data.risky_clauses)}</ul>
                        <hr>
                        <p><strong><i class="fas fa-search"></i> Missing Standard Clauses:</strong></p>
                        <ul>${createList(data.missing_clauses)}</ul>
                    `;
                        } else {
                            throw new Error(data.error || 'Analysis failed.');
                        }
                    } catch (error) {
                        clauseResults.style.display = 'block';
                        clauseResults.innerHTML = `<h4 class="result-fail">Error</h4><p>${error.message}</p>`;
                    } finally {
                        revert();
                    }
                });
            }

            // --- NEW: Key Date Extraction Logic ---
            const extractDatesButton = document.getElementById('extract-dates-button');
            if (extractDatesButton) {
                extractDatesButton.addEventListener('click', async() => {
                            const datesFileInput = document.getElementById('dates-file-input');
                            const datesResults = document.getElementById('dates-results');
                            if (!datesFileInput.files[0]) {
                                return alert('Please upload a file to extract dates from.');
                            }
                            const revert = addLoadingState(extractDatesButton, 'Extracting...');
                            datesResults.style.display = 'none';
                            const formData = new FormData();
                            formData.append('file', datesFileInput.files[0]);
                            try {
                                const response = await fetch('/api/extract_key_dates', { method: 'POST', body: formData });
                                const data = await response.json();
                                datesResults.style.display = 'block';
                                if (response.ok && data.key_dates && data.key_dates.length > 0) {
                                    datesResults.innerHTML = `
                        <h4 class="result-success">Extracted Key Dates:</h4>
                        <ul>
                            ${data.key_dates.map(item => `<li><strong>${item.date}:</strong> ${item.significance}</li>`).join('')}
                        </ul>
                    `;
                } else {
                     datesResults.innerHTML = `<h4 class="result-fail">Extraction Failed</h4><p>${data.error || 'No significant dates were found in this document.'}</p>`;
                }
            } catch (error) {
                datesResults.style.display = 'block';
                datesResults.innerHTML = `<h4 class="result-fail">Error</h4><p>${error.message}</p>`;
            } finally {
                revert();
            }
        });
    }

    // --- AI Clause Drafter Logic ---
    const draftClauseButton = document.getElementById('draft-clause-button');
    if (draftClauseButton) {
        draftClauseButton.addEventListener('click', async () => {
            const clauseDescriptionInput = document.getElementById('clause-description-input');
            const additionalClausesTextarea = document.getElementById('additional-clauses-textarea');
            const description = clauseDescriptionInput.value.trim();
            if (!description) {
                return alert('Please enter a description for the clause you want to draft.');
            }
            const revertButton = addLoadingState(draftClauseButton, 'Drafting...');
            try {
                const response = await fetch('/api/draft_clause', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: description })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to draft clause.');
                }
                const currentClauses = additionalClausesTextarea.value;
                const newClause = data.clause;
                additionalClausesTextarea.value = currentClauses ? `${currentClauses}\n\n${newClause}` : newClause;
                clauseDescriptionInput.value = '';
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                revertButton();
            }
        });
    }
});