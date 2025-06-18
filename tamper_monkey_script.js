    // ==UserScript==
    // @name         DD Search Ultra Optimisé - Inspiré Lucas Verdonk
    // @namespace    http://tampermonkey.net/
    // @version      2.1
    // @description  Recherche ultra-optimisée dans les dashboards Datadog
    // @author       Hugo Bui & Mathilde Talec (inspiré de Lucas Verdonk)
    // @match        https://app.datadoghq.com/dashboard/*
    // @require      https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js
    // @grant        none
    // ==/UserScript==

    (function () {
        'use strict';

        // Variables globales
        let searchBar = document.createElement('input');
        let currentIndex = 0;
        let currentResults = [];
        let titleBar;
        let loadingSpinner;
        let isMagicSearchRunning = false;
        const aiGatewayEndpoint = 'https://openai-api-proxy.us1.staging.dog/v1/chat/completions';
        let originalWidgetStates = new Map();

        // Mots vides optimisés (français + anglais)
        const stopwords = [
            "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
            "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
            "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
            "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
            "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
            "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
            "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
            "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
            "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
            "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
            "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
            "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
            "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves",
            // French stopwords
            "à", "â", "abord", "afin", "ah", "ai", "aie", "ainsi", "ait", "alors", "après", "as", "assez", "au", "aucun",
            "aucune", "aujourd", "aujourd'hui", "auquel", "aura", "aurait", "aussi", "autre", "autres", "aux", "avant", "avec",
            "avoir", "ayant", "bah", "bas", "beaucoup", "bien", "car", "ce", "ceci", "cela", "celle", "celles", "celui",
            "cent", "cependant", "certain", "certaine", "certaines", "cette", "ceux", "chaque", "chez", "comme", "comment",
            "dans", "de", "des", "du", "elle", "en", "encore", "entre", "est", "et", "être", "eu", "eux", "faire", "fait",
            "fois", "il", "ils", "je", "la", "le", "les", "leur", "leurs", "lui", "ma", "mais", "me", "même", "mes", "moi",
            "mon", "ne", "nos", "notre", "nous", "on", "ont", "ou", "où", "par", "pas", "pour", "qu", "que", "quel", "quelle",
            "quelles", "quels", "qui", "sa", "sans", "se", "sera", "ses", "si", "son", "sont", "sur", "ta", "te", "tes",
            "toi", "ton", "tous", "tout", "toute", "toutes", "tu", "un", "une", "vos", "votre", "vous", "y"
        ];

        function removeStopwords(text) {
            const words = text.split(' ');
            const filteredWords = words.filter(word => !stopwords.includes(word.toLowerCase()));
            return filteredWords.join(' ');
        }

        function waitForElement(selector, parent, callback, maxTries = 10, timeOut = 500) {
            if (maxTries <= 0) {
                return null;
            }
            const element = parent.querySelector(selector);

            if (element) {
                callback(element);
            } else {
                setTimeout(() => waitForElement(selector, parent, callback, maxTries - 1), timeOut * 2);
            }
        }

        function addCss() {
            const style = document.createElement('style');
            style.innerHTML = `
                /* Datadog Native Design System */

                /* Loading Spinner - Datadog Style */
                #loading-spinner {
                    border: 3px solid #f3f4f6;
                    border-top: 3px solid #8b5cf6;
                    border-radius: 50%;
                    width: 12px;
                    height: 12px;
                    animation: spin 1s linear infinite;
                    margin-left: 8px;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                /* Widget Highlighting - Soft Purple Theme */
                .highlight {
                    background-color: rgba(99, 102, 241, 0.1) !important;
                    border: 2px solid #8b5cf6 !important;
                    border-radius: 6px !important;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
                    transition: all 0.15s ease !important;
                }

                /* Main Search Container - Native Datadog Look */
                #dd-search-container {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin: 8px 0;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    position: relative;
                }

                /* Search Input Field */
                #dd-search-container #dash-search-widget {
                    height: 32px;
                    padding: 0 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #374151;
                    font-size: 14px;
                    font-family: inherit;
                    min-width: 200px;
                    flex: 1;
                    transition: all 0.15s ease;
                }

                #dd-search-container #dash-search-widget::placeholder {
                    color: #9ca3af;
                }

                #dd-search-container #dash-search-widget:focus {
                    outline: none;
                    border-color: #8b5cf6;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                /* Button System */
                .dd-search-button {
                    height: 32px;
                    padding: 0 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: #f8f9fa;
                    color: #6b7280;
                    font-size: 13px;
                    font-weight: 400;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    white-space: nowrap;
                }

                .dd-search-button:hover {
                    background: #f3f4f6;
                    border-color: #d1d5db;
                    color: #4b5563;
                }

                .dd-search-button:active {
                    transform: translateY(1px);
                }

                /* Primary Button (Search) - More subtle */
                .dd-search-button.primary {
                    background: #f3f4f6;
                    color: #8b5cf6;
                    border-color: #e5e7eb;
                    font-weight: 500;
                }

                .dd-search-button.primary:hover {
                    background: #ede9fe;
                    border-color: #c4b5fd;
                    color: #7c3aed;
                }

                /* Magic Button - More subtle gradient */
                .dd-search-button.magic {
                    background: linear-gradient(135deg, #f3f4f6 0%, #ede9fe 100%);
                    color: #8b5cf6;
                    border-color: #e5e7eb;
                    font-size: 14px;
                    font-weight: 400;
                }

                .dd-search-button.magic:hover {
                    background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
                    color: #7c3aed;
                    border-color: #c4b5fd;
                }

                /* Match Count Display */
                #dd-search-container #match-count {
                    background: #f3f4f6;
                    color: #6b7280;
                    font-size: 12px;
                    font-weight: 500;
                    padding: 4px 8px;
                    border-radius: 4px;
                    white-space: nowrap;
                }

                /* Search Results Dropdown */
                #dd-search-container #search-results {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    max-height: 300px;
                    overflow-y: auto;
                    z-index: 1000;
                    margin-top: 4px;
                    list-style: none;
                    padding: 0;
                    margin-left: 0;
                    margin-right: 0;
                }

                #dd-search-container #search-results li {
                    padding: 8px 12px;
                    border-bottom: 1px solid #f3f4f6;
                    cursor: pointer;
                    transition: background-color 0.15s ease;
                }

                #dd-search-container #search-results li:last-child {
                    border-bottom: none;
                }

                #dd-search-container #search-results li:hover {
                    background-color: #f3f4f6;
                }

                #dd-search-container .widget-name {
                    font-weight: 600;
                    color: #1f2937;
                    font-size: 14px;
                    line-height: 1.4;
                }

                #dd-search-container .widget-explanation {
                    font-weight: 400 !important;
                    color: #6b7280;
                    font-size: 12px;
                    line-height: 1.3;
                    margin-top: 2px;
                }

                /* Responsive Design */
                @media (max-width: 768px) {
                    #dd-search-container {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    #dd-search-container #dash-search-widget {
                        width: 100%;
                        margin-bottom: 8px;
                    }

                    .dd-search-button {
                        width: 100%;
                        margin-bottom: 4px;
                    }
                }

                @media (max-width: 480px) {
                    #dd-search-container {
                        padding: 8px 12px;
                    }

                    .dd-search-button {
                        height: 28px;
                        font-size: 12px;
                        padding: 0 8px;
                    }

                    #dd-search-container #dash-search-widget {
                        height: 28px;
                        font-size: 13px;
                    }
                }

                /* Legacy support for old selectors */
                .title_bar #dash-search-widget,
                .title_bar #match-count,
                .title_bar #search-results,
                .title_bar #search-results li,
                .title_bar .widget-name,
                .title_bar .widget-explanation,
                .title_bar #search-results li:hover {
                    /* Inherit from new styles above */
                }
            `;
            document.head.appendChild(style);
        }

        function createUI(titleBar) {
            // Check if UI already exists and remove it first
            const existingContainer = document.getElementById('dd-search-container');
            if (existingContainer) {
                console.log('DD Search: Removing existing UI before creating new one');
                existingContainer.remove();
            }

            // Create a container that wraps all search elements
            const searchContainer = document.createElement('div');
            searchContainer.id = 'dd-search-container';

            searchBar.type = 'text';
            searchBar.id = 'dash-search-widget';
            searchBar.placeholder = 'Search widgets...';

            const searchButton = document.createElement('button');
            searchButton.className = 'dd-search-button primary';
            searchButton.textContent = 'Search';
            searchButton.onclick = handleSearch;

            const magicButton = document.createElement('button');
            magicButton.className = 'dd-search-button magic';
            magicButton.innerHTML = '🔮';
            magicButton.title = 'AI Magic Search';
            magicButton.onclick = handleMagicButtonClick;

            const nextButton = document.createElement('button');
            nextButton.className = 'dd-search-button';
            nextButton.textContent = 'Next';
            nextButton.onclick = () => navigateResults(1);

            const prevButton = document.createElement('button');
            prevButton.className = 'dd-search-button';
            prevButton.textContent = 'Previous';
            prevButton.onclick = () => navigateResults(-1);

            // Create a loading spinner
            loadingSpinner = document.createElement('div');
            loadingSpinner.id = 'loading-spinner';
            loadingSpinner.style.display = 'none';

            // Add all elements to the container
            searchContainer.appendChild(searchBar);
            searchContainer.appendChild(searchButton);
            searchContainer.appendChild(magicButton);
            searchContainer.appendChild(prevButton);
            searchContainer.appendChild(nextButton);
            searchContainer.appendChild(loadingSpinner);

            // Add the container to the title bar
            titleBar.appendChild(searchContainer);

            // Event listeners
            searchBar.addEventListener('input', debounce(handleSearch, 300));
            searchBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleSearch();
                if (e.key === 'ArrowDown') navigateResults(1);
                if (e.key === 'ArrowUp') navigateResults(-1);
            });
            
            // Faire réapparaître la liste quand on clique sur la barre de recherche
            searchBar.addEventListener('click', () => {
                const resultList = document.getElementById('search-results');
                if (resultList && currentResults && currentResults.length > 0) {
                    resultList.style.display = 'block';
                }
            });
            
            // Optionnel : faire réapparaître la liste quand on met le focus sur la barre
            searchBar.addEventListener('focus', () => {
                const resultList = document.getElementById('search-results');
                if (resultList && currentResults && currentResults.length > 0) {
                    resultList.style.display = 'block';
                }
            });
            
            // Fermer la liste quand on clique en dehors
            document.addEventListener('click', (event) => {
                const resultList = document.getElementById('search-results');
                const searchContainer = document.getElementById('dd-search-container');
                
                if (resultList && searchContainer) {
                    // Vérifier si le clic est en dehors du container de recherche
                    if (!searchContainer.contains(event.target)) {
                        resultList.style.display = 'none';
                    }
                }
            });
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function getPreprocessedData() {
            clearHighlights();

            const query = removeStopwords(searchBar.value);
            const strData = localStorage.getItem('widgetData') || '[]';
            const storedData = JSON.parse(strData);

            return { query, storedData };
        }

        function handlePostprocessing(result) {
            currentIndex = 0;
            displaySearchResults(result);

            if (result.length > 0) {
                focusOnWidget(currentIndex);
                // Automatically apply filtering to show only matching widgets
                applyFilter();
            } else {
                // Clear filtering when no results found
                clearFilter();
            }
        }

        function clearHighlights() {
            document.querySelectorAll('.highlight').forEach(highlight => {
                highlight.classList.remove('highlight');
            });
        }

        function applyFilter() {
            if (!currentResults || currentResults.length === 0) {
                return;
            }

            // Store original states if not already stored
            if (originalWidgetStates.size === 0) {
                // Only look for actual dashboard widgets, not all elements with IDs
                const elements = document.querySelectorAll('.dashboard_widget');
                elements.forEach(element => {
                    const id = element.id;
                    if (id && id.trim()) {
                        originalWidgetStates.set(id, {
                            display: element.style.display,
                            visibility: element.style.visibility,
                            opacity: element.style.opacity
                        });
                    }
                });
            }

            // Get all widget IDs from search results
            const matchingIds = currentResults.map(result => result.id);
            console.log('DD Search: Filtering to show only these widgets:', matchingIds);

            // Hide only dashboard widgets, not all elements
            const dashboardWidgets = document.querySelectorAll('.dashboard_widget');
            dashboardWidgets.forEach(widget => {
                const id = widget.id;
                if (id && id.trim() && !matchingIds.includes(id)) {
                    widget.classList.add('widget-filtered-out');
                    widget.style.display = 'none';
                    console.log('DD Search: Hiding widget:', id);
                }
            });

            // Ensure matching widgets are visible
            matchingIds.forEach(id => {
                let widget = document.getElementById(id);

                // Essayer les différents formats d'ID
                if (!widget && id.startsWith('widget_')) {
                    widget = document.getElementById(id.replace('widget_', ''));
                }
                if (!widget && !id.startsWith('widget_')) {
                    widget = document.getElementById(`widget_${id}`);
                }

                if (widget && widget.classList.contains('dashboard_widget')) {
                    widget.classList.remove('widget-filtered-out');
                    widget.classList.add('widget-filtered-in');
                    widget.style.display = '';
                    console.log('DD Search: Showing widget:', id, '→', widget.id);
                } else {
                    console.log('DD Search: Widget not found or not a dashboard widget:', id);
                }
            });
        }

        function clearFilter() {
            console.log('DD Search: Clearing filter, restoring all widgets');

            // Restore original display states for dashboard widgets only
            originalWidgetStates.forEach((state, id) => {
                const widget = document.getElementById(id);
                if (widget && widget.classList.contains('dashboard_widget')) {
                    widget.classList.remove('widget-filtered-out', 'widget-filtered-in');

                    // Restore original styles
                    if (state.display !== undefined) {
                        widget.style.display = state.display || '';
                    }
                    if (state.visibility !== undefined) {
                        widget.style.visibility = state.visibility || '';
                    }
                    if (state.opacity !== undefined) {
                        widget.style.opacity = state.opacity || '';
                    }
                }
            });

            // Also clear any remaining filtered dashboard widgets
            const filteredWidgets = document.querySelectorAll('.dashboard_widget.widget-filtered-out, .dashboard_widget.widget-filtered-in');
            filteredWidgets.forEach(widget => {
                widget.classList.remove('widget-filtered-out', 'widget-filtered-in');
                widget.style.display = '';
            });

            // Clear the stored states
            originalWidgetStates.clear();
        }

        async function handleMagicButtonClick() {
            const { query, storedData } = getPreprocessedData();

            // If search is empty, clear filter and show all widgets
            if (!query.trim()) {
                clearFilter();
                displaySearchResults([]);
                return;
            }

            const result = await handleMagicSearch(storedData, query);
            handlePostprocessing(result);
        }

        async function handleMagicSearch(storedData, query) {
            if (isMagicSearchRunning) {
                return;
            }

            isMagicSearchRunning = true;
            loadingSpinner.style.display = 'block';

            const prompt =
                `Filter the relevant widgets based on the user query, the results should be sorted from most relevant to least relevant.\n\n` +
                `The results should not contain duplicate\n` +
                `The id of the widget should be the same as the id of the widgets list\n\n` +
                `User query: "${query}"\n\n` +
                `widgets: ${JSON.stringify(storedData)}\n\n` +
                `the output should be JSON with the following format:\n\n` +
                `{ "widgets": [{"id":"id","title":"title : title of the widget and a short explanation of why it is relevant","exists":true/false}] }\n\n` +
                `Do not add any other words to the answer, just the JSON.\n\n` +
                `produce a maximum of 6 results or less\n\n` +
                `make sure that the widget ids are correct compared to the ids in the widgets list if they are incorrect write exists:false\n\n` +
                `Relevant widgets:`;

            const payload = {
                model: "gpt-4o-mini",
                messages: [
                    {
                        "role": "system",
                        "content":
                            "You are a program that takes a list of widgets as inputs and filters them based on their relevancy to a user query. " +
                            "You have been trained to produce the most relevant results based on a search that highlights a potential problem."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            };

            try {
                const response = await fetch(aiGatewayEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer pk-***lucas.verdonk@datadoghq.com***'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error('OpenAI API responded with an error.');
                }

                const resultData = await response.json();
                const assistantMessage = resultData.choices[0].message.content;

                let relevantWidgets;
                try {
                    relevantWidgets = JSON.parse(assistantMessage);
                } catch (parseError) {
                    const cleanedMessage = assistantMessage.replace(/```json\n?|\n?```/g, '').trim();
                    relevantWidgets = JSON.parse(cleanedMessage);
                }

                loadingSpinner.style.display = 'none';
                isMagicSearchRunning = false;

                return relevantWidgets.widgets;
            } catch (error) {
                loadingSpinner.style.display = 'none';
                isMagicSearchRunning = false;

                // Fallback vers recherche standard
                return handleStandardSearch(storedData, query);
            }
        }

        async function handleSearch() {
            const { query, storedData } = getPreprocessedData();

            // If search is empty, clear filter and show all widgets
            if (!query.trim()) {
                clearFilter();
                displaySearchResults([]);
                return;
            }

            const result = handleStandardSearch(storedData, query);
            handlePostprocessing(result);
        }

        function handleStandardSearch(storedData, query) {
            const options = {
                includeScore: true,
                threshold: 0.3,
                tokenize: true,
                matchAllTokens: false,
                keys: [{ name: "title", weight: 1 }],
                ignoreLocation: true,
                useExtendedSearch: true,
            };

            const fuse = new Fuse(storedData, options);
            const fuseResults = fuse.search(query);
            const mappedResults = fuseResults.map(result => {
                return {
                    id: result.item.id,
                    title: result.item.title,
                    enrichedText: result.item.enrichedText || result.item.title,
                    queries: result.item.queries || []
                };
            });

            console.log(`🔍 Standard search for "${query}": ${mappedResults.length} results`);
            return mappedResults;
        }

        function displaySearchResults(results) {
            currentResults = results;
            let resultList = document.getElementById('search-results');
            if (!resultList) {
                resultList = document.createElement('ul');
                resultList.id = 'search-results';
                const searchContainer = document.getElementById('dd-search-container');
                if (searchContainer) {
                    // Make the container position relative for the dropdown
                    searchContainer.style.position = 'relative';
                    searchContainer.appendChild(resultList);
                } else if (titleBar) {
                    titleBar.appendChild(resultList);
                } else {
                    document.body.appendChild(resultList);
                }
            }

            resultList.innerHTML = '';

            if (results.length === 0) {
                const noResultsItem = document.createElement('li');
                noResultsItem.textContent = 'No widgets found';
                noResultsItem.style.color = '#9ca3af';
                noResultsItem.style.fontStyle = 'italic';
                noResultsItem.style.textAlign = 'center';
                resultList.appendChild(noResultsItem);
                resultList.style.display = 'block';
                return;
            }

            results.forEach((result, index) => {
                const listItem = document.createElement('li');

                const widgetName = document.createElement('div');
                widgetName.className = 'widget-name';
                widgetName.textContent = result.title || 'Untitled Widget';


                const widgetExplanation = document.createElement('div');
                widgetExplanation.className = 'widget-explanation';
                widgetExplanation.textContent = result.explanation || 'No description available';

                listItem.appendChild(widgetName);
                listItem.appendChild(widgetExplanation);


                
                listItem.appendChild(widgetName);
                
                // Only add explanation div if there's meaningful content (not the default placeholder)
                if (result.explanation && 
                    result.explanation.trim() !== '' && 
                    result.explanation !== 'No description available') {
                    const widgetExplanation = document.createElement('div');
                    widgetExplanation.className = 'widget-explanation';
                    widgetExplanation.textContent = result.explanation;
                    listItem.appendChild(widgetExplanation);
                }
                

                listItem.onclick = () => {
                    focusOnWidget(index);
                    resultList.style.display = 'none';
                };

                resultList.appendChild(listItem);
            });

            resultList.style.display = 'block';
            updateMatchCount(results.length);
        }

        function scrollToElement(element) {
            const titleBar = document.querySelector('.title_bar');
            const headerOffset = titleBar ? titleBar.offsetHeight : 0;
            const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
            const windowHeight = window.innerHeight;
            
            // Calculer la position pour placer l'élément plus bas que le centre (au 1/3 du haut)
            const offsetPosition = elementPosition - (windowHeight * 0.65) + (element.offsetHeight / 2) + headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }

        function highlightText(element) {
            element.classList.add('highlight');
        }

        function focusOnWidget(index) {
            currentIndex = index;
            clearHighlights();

            if (!currentResults || !currentResults[index]) return;

            const targetWidgetId = currentResults[index].id;
            let targetWidget = document.getElementById(targetWidgetId);

            // Si pas trouvé avec l'ID complet, essayer sans le préfixe "widget_"
            if (!targetWidget && targetWidgetId.startsWith('widget_')) {
                const simpleId = targetWidgetId.replace('widget_', '');
                targetWidget = document.getElementById(simpleId);
            }

            // Si toujours pas trouvé, essayer avec le préfixe
            if (!targetWidget && !targetWidgetId.startsWith('widget_')) {
                targetWidget = document.getElementById(`widget_${targetWidgetId}`);
            }

            if (targetWidget) {
                console.log(`🎯 Focusing on widget: ${targetWidgetId} → Found element: ${targetWidget.id}`);
                scrollToElement(targetWidget);

                // Highlight SEULEMENT le titre du widget
                const titleElement = targetWidget.querySelector('h3, h2, h1, .title, [data-testid*="title"]');
                if (titleElement) {
                    titleElement.classList.add('highlight');
                } else {
                    // Si pas de titre trouvé, highlight le widget entier
                    targetWidget.classList.add('highlight');
                }
            } else {
                console.warn(`❌ Widget not found: ${targetWidgetId}`);
            }
        }

        function navigateResults(step) {
            if (!currentResults || currentResults.length === 0) return;

            currentIndex = (currentIndex + step + currentResults.length) % currentResults.length;
            focusOnWidget(currentIndex);
        }

        function updateMatchCount(count) {
            let matchCountElement = document.getElementById('match-count');
            const searchContainer = document.getElementById('dd-search-container');

            if (!matchCountElement && searchContainer) {
                matchCountElement = document.createElement('div');
                matchCountElement.id = 'match-count';
                searchContainer.appendChild(matchCountElement);
            }

            if (matchCountElement) {
                if (count > 0) {
                    matchCountElement.textContent = `${count} match${count > 1 ? 'es' : ''}`;
                    matchCountElement.style.display = 'block';
                } else {
                    matchCountElement.textContent = 'No matches';
                    matchCountElement.style.display = 'block';
                }
            }
        }

        async function parseWidgets() {
            console.log('🔍 Parsing des widgets avec extraction de queries...');
            const widgetData = [];

            // Extraire l'ID du dashboard depuis l'URL
            const dashboardPath = window.location.pathname.split('/dashboard/')[1]?.split('?')[0];
            const dashboardId = dashboardPath?.split('/')[0]; // Ne prendre que la première partie avant le '/'
            console.log(`📊 Dashboard path: ${dashboardPath}`);
            console.log(`📊 Dashboard ID extrait: ${dashboardId}`);

            if (dashboardId) {
                try {
                    console.log('🌐 Tentative de récupération des données via API...');
                    const apiUrl = `https://app.datadoghq.com/api/v1/dashboard/${dashboardId}?with_full_response=true`;
                    console.log(`📡 API URL: ${apiUrl}`);

                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });

                    if (response.ok) {
                        const dashboardData = await response.json();
                        console.log(`✅ Données API récupérées!`);
                        console.log(`📊 Dashboard: "${dashboardData.title}"`);
                        console.log(`📊 Widgets: ${dashboardData.widgets?.length || 0}`);

                        if (dashboardData.widgets?.length > 0) {
                            // Fonction récursive pour extraire tous les widgets et leurs queries
                            function extractAllWidgets(widgets, parentTitle = '', depth = 0) {
                                let extractedWidgets = [];
                                const indent = '  '.repeat(depth);

                                console.log(`${indent}📋 Niveau ${depth}: ${widgets.length} widgets à analyser`);

                                widgets.forEach((widget, index) => {
                                    try {
                                        const id = widget.id?.toString() || `temp_${depth}_${index}`;
                                        const definition = widget.definition || {};
                                        const title = definition.title || `Widget-${index}`;
                                        const widgetType = definition.type || 'unknown';

                                        // Si c'est un groupe avec des widgets enfants
                                        if (widgetType === 'group' && definition.widgets?.length > 0) {
                                            console.log(`${indent}📁 Groupe "${title}" → ${definition.widgets.length} enfants`);
                                            const childWidgets = extractAllWidgets(definition.widgets, title, depth + 1);
                                            extractedWidgets = extractedWidgets.concat(childWidgets);
                                        } else if (widgetType !== 'note' && widgetType !== 'group') {
                                            // Extraire les queries du widget
                                            const queries = extractWidgetQueries(definition);

                                            // Construction du texte enrichi
                                            let enrichedText = title;
                                            if (parentTitle) {
                                                enrichedText = `${parentTitle} > ${title}`;
                                            }

                                            // Ajouter les queries nettoyées au texte enrichi
                                            if (queries.length > 0) {
                                                const cleanQueries = queries.map(q => {
                                                    // Extraire patterns importants des queries
                                                    const metrics = (q.match(/[\w\.]+(?=\{)/g) || []).slice(0, 3);
                                                    const services = q.match(/service:[\w\-\*]+/g) || [];
                                                    const jobs = q.match(/job:[\w\-\*]+/g) || [];
                                                    const flavors = q.match(/flavor:[\w\-\*]+/g) || [];
                                                    const tags = q.match(/[\w\-]+:[\w\-\*]+/g) || [];

                                                    return [...metrics, ...services, ...jobs, ...flavors, ...tags.slice(0, 5)].join(' ');
                                                }).filter(q => q.trim().length > 0);

                                                if (cleanQueries.length > 0) {
                                                    enrichedText += ' ' + cleanQueries.join(' ');
                                                }
                                            }

                                            const finalWidget = {
                                                id: `widget_${id}`, // S'assurer que l'ID correspond au DOM
                                                title: title,
                                                queries: queries,
                                                enrichedText: enrichedText.trim(),
                                                type: widgetType
                                            };

                                            extractedWidgets.push(finalWidget);
                                            console.log(`${indent}✅ "${title}" (${queries.length} queries)`);

                                            // Debug spécial pour "delancie"
                                            if (title.toLowerCase().includes('delancie') ||
                                                enrichedText.toLowerCase().includes('delancie') ||
                                                queries.some(q => q.toLowerCase().includes('delancie'))) {
                                                console.log(`${indent}🎯 DELANCIE FOUND: "${title}"`);
                                                queries.forEach((q, qi) => {
                                                    if (q.toLowerCase().includes('delancie')) {
                                                        console.log(`${indent}   Query ${qi+1}: ${q.substring(0, 100)}...`);
                                                    }
                                                });
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`${indent}❌ Erreur parsing widget ${index}:`, error);
                                    }
                                });

                                return extractedWidgets;
                            }

                            // Fonction pour extraire les queries d'un widget
                            function extractWidgetQueries(definition) {
                                const queries = [];

                                function findQueries(obj, path = '') {
                                    if (!obj || typeof obj !== 'object') return;

                                    for (const key in obj) {
                                        const value = obj[key];
                                        const currentPath = path ? `${path}.${key}` : key;

                                        // Query simple (string)
                                        if (key === 'query' && typeof value === 'string' && value.trim()) {
                                            queries.push(value.trim());
                                        }
                                        // Array de queries
                                        else if (key === 'queries' && Array.isArray(value)) {
                                            value.forEach((q) => {
                                                if (q && typeof q === 'object' && q.query) {
                                                    queries.push(q.query.trim());
                                                } else if (typeof q === 'string' && q.trim()) {
                                                    queries.push(q.trim());
                                                }
                                            });
                                        }
                                        // Query string dans logs
                                        else if (key === 'query_string' && typeof value === 'string' && value.trim()) {
                                            queries.push(value.trim());
                                        }
                                        // Formulas
                                        else if (key === 'formula' && typeof value === 'string' && value.trim()) {
                                            queries.push(value.trim());
                                        }
                                        // Récursif dans les objets
                                        else if (typeof value === 'object' && value !== null) {
                                            findQueries(value, currentPath);
                                        }
                                    }
                                }

                                findQueries(definition);
                                return [...new Set(queries)]; // Dédupliquer
                            }

                            // Extraire tous les widgets
                            const allWidgets = extractAllWidgets(dashboardData.widgets);
                            widgetData.push(...allWidgets);

                            console.log(`🎯 Extraction API terminée: ${widgetData.length} widgets`);

                            // Debug final pour "delancie"
                            const delancieWidgets = widgetData.filter(w =>
                                w.title.toLowerCase().includes('delancie') ||
                                w.enrichedText.toLowerCase().includes('delancie') ||
                                w.queries.some(q => q.toLowerCase().includes('delancie'))
                            );
                            console.log(`🎯 TOTAL widgets avec "delancie": ${delancieWidgets.length}`);
                            delancieWidgets.forEach((w, i) => {
                                console.log(`  ${i+1}. "${w.title}" (${w.queries.length} queries)`);
                            });
                        }
                    } else {
                        console.warn(`❌ Erreur API: ${response.status} ${response.statusText}`);
                        throw new Error(`API Error: ${response.status}`);
                    }
                } catch (error) {
                    console.warn('❌ Erreur récupération API, fallback vers DOM:', error);
                }
            }

            // Fallback: parsing DOM si l'API échoue
            if (widgetData.length === 0) {
                console.log('📋 Fallback vers parsing DOM...');
                const widgets = document.querySelectorAll('.dashboard_widget');

                widgets.forEach(widget => {
                    const id = widget.id;
                    waitForElement('h3', widget, function (titleElement) {
                        const title = titleElement?.textContent || 'notitle';
                        if (title !== 'notitle') {
                            widgetData.push({
                                id,
                                title,
                                enrichedText: title,
                                queries: [],
                                type: 'dashboard_widget'
                            });
                            localStorage.setItem('widgetData', JSON.stringify(widgetData));
                        }
                    });
                });

                // Fallback: chercher aussi les widgets avec IDs numériques
                const numericElements = document.querySelectorAll('[id]');
                numericElements.forEach(element => {
                    const id = element.id;
                    if (id && /^\d{10,}$/.test(id)) {
                        const titleElement = element.querySelector('h3, h2, [data-testid*="title"], .title');
                        if (titleElement && titleElement.textContent.trim()) {
                            const title = titleElement.textContent.trim();
                            const exists = widgetData.find(w => w.id === id);
                            if (!exists) {
                                widgetData.push({
                                    id,
                                    title,
                                    enrichedText: title,
                                    queries: [],
                                    type: 'fallback_widget'
                                });
                                localStorage.setItem('widgetData', JSON.stringify(widgetData));
                            }
                        }
                    }
                });
            }

            localStorage.setItem('widgetData', JSON.stringify(widgetData));
            return widgetData;
        }

        function extractWidgetTitle(element) {
            const selectors = ['h3', 'h2', '[data-testid*="title"]', '.title'];

            for (const selector of selectors) {
                const titleEl = element.querySelector(selector);
                if (titleEl && titleEl.textContent.trim()) {
                    return titleEl.textContent.trim();
                }
            }

            return 'Widget sans titre';
        }

        // Variables pour la détection de changement d'URL
        let currentUrl = window.location.href;
        let isInitialized = false;
        let titleBarFound = false; // Déclarer la variable au bon niveau

        // Fonction d'initialisation principale
        async function initializeScript() {
            if (isInitialized) {
                console.log('DD Search: Script déjà initialisé, nettoyage...');
                cleanup();
            }

            console.log('DD Search: Initialisation sur', window.location.href);
            isInitialized = true;
            titleBarFound = false;

            // Try multiple selectors for the title bar
            const titleBarSelectors = [
                '.title_bar',
                '.title-bar',
                '.dashboard-title-bar',
                '.dashboard-header',
                '[data-testid="dashboard-title"]',
                '.dashboard-title',
                'header'
            ];

            // Try each selector
            titleBarSelectors.forEach(selector => {
                if (!titleBarFound) {
                    waitForElement(selector, document, async function (t) {
                        if (!titleBarFound) {
                            titleBar = t;
                            titleBarFound = true;
                            console.log('DD Search: Found title bar with selector:', selector);
                            createUI(titleBar);
                            await parseWidgets();
                        }
                    }, 5, 300); // Shorter timeout per selector
                }
            });

            // If no title bar found, wait longer and try again
            setTimeout(() => {
                if (!titleBarFound) {
                    console.log('DD Search: No title bar found, trying again...');
                    // Try again with a longer wait
                    waitForElement('.title_bar', document, async function (t) {
                        titleBar = t;
                        titleBarFound = true;
                        console.log('DD Search: Found title bar on second try');
                        createUI(titleBar);
                        await parseWidgets();
                    }, 10, 1000);
                }
            }, 3000);
        }

        // Fonction de nettoyage
        function cleanup() {
            console.log('DD Search: Nettoyage en cours...');

            // Remove ALL search containers first (including duplicates)
            const searchContainers = document.querySelectorAll('#dd-search-container');
            searchContainers.forEach(container => {
                console.log('DD Search: Suppression container de recherche');
                container.remove();
            });

            // Supprimer tous les éléments de l'interface de recherche individuellement
            const existingElements = [
                '#dash-search-widget',
                '#search-results',
                '#match-count',
                '#loading-spinner',
                '.dd-search-button' // Supprimer tous les boutons
            ];

            existingElements.forEach(selector => {
                const elements = document.querySelectorAll(selector); // Utiliser querySelectorAll pour les classes
                elements.forEach(element => {
                    console.log('DD Search: Suppression de', selector);
                    element.remove();
                });
            });

            // Reset des variables
            currentResults = [];
            currentIndex = 0;
            isMagicSearchRunning = false;
            titleBar = null; // Reset de la référence à la title bar
            titleBarFound = false; // Reset this flag too
            clearFilter();
            clearHighlights();

            console.log('DD Search: Nettoyage terminé');
        }

        // Détection des changements d'URL
        function detectUrlChange() {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('DD Search: URL changée vers', currentUrl);

                // Réinitialiser seulement si c'est un dashboard
                if (currentUrl.includes('/dashboard/')) {
                    setTimeout(() => {
                        initializeScript();
                    }, 1000); // Attendre que la page se charge
                }
            }
        }

        // Observer les changements d'URL (pour les navigations SPA)
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function() {
            originalPushState.apply(history, arguments);
            setTimeout(detectUrlChange, 100);
        };

        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            setTimeout(detectUrlChange, 100);
        };

        window.addEventListener('popstate', () => {
            setTimeout(detectUrlChange, 100);
        });

        // Observer les changements dans le DOM pour détecter les navigations
        const observer = new MutationObserver(() => {
            detectUrlChange();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initialisation
        addCss();
        initializeScript();

    })();