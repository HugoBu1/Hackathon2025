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
                #loading-spinner {
                    border: 16px solid #f3f3f3;
                    border-top: 16px solid #3498db;
                    border-radius: 50%;
                    width: 15px;
                    height: 15px;
                    animation: spin 2s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .highlight {
                    background-color: #ffeb3b !important;
                    border: 2px solid #ff9800 !important;
                    border-radius: 4px !important;
                }

                .title_bar #dash-search-widget, #dd-search-container #dash-search-widget {
                    height: 30px;
                    margin-right: 8px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    padding: 0 12px;
                }

                .title_bar #dash-search-widget:focus, #dd-search-container #dash-search-widget:focus {
                    border-color: #3279d7;
                    outline: none;
                }

                .dd-search-button {
                    color: #fff !important;
                    background-color: #3279d7 !important;
                    border: none !important;
                    border-radius: 4px !important;
                    padding: 6px 12px !important;
                    margin: 0 4px !important;
                    cursor: pointer !important;
                }

                .dd-search-button:hover {
                    background-color: #285ea5 !important;
                }

                .title_bar #match-count, #dd-search-container #match-count {
                    margin-top: 4px;
                    color: #666;
                }

                .title_bar #search-results, #dd-search-container #search-results {
                    list-style: none;
                    padding: 0;
                    margin-top: 8px;
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background: #fff;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                .title_bar #search-results li, #dd-search-container #search-results li {
                    padding: 8px 12px;
                    border-bottom: 1px solid #eee;
                    font-weight: bold !important;
                }

                .title_bar .widget-name, #dd-search-container .widget-name {
                    font-weight: bold !important;
                }

                .title_bar .widget-explanation, #dd-search-container .widget-explanation {
                    font-weight: normal !important;
                    color: #666;
                }

                .title_bar #search-results li:hover, #dd-search-container #search-results li:hover {
                    background-color: #f7f7f7;
                    cursor: pointer;
                }
            `;
            document.head.appendChild(style);
        }

        function createUI(titleBar) {
            searchBar.type = 'text';
            searchBar.id = 'dash-search-widget';
            searchBar.placeholder = 'Search Widgets';

            const searchButton = document.createElement('button');
            searchButton.className = 'dd-search-button';
            searchButton.textContent = 'Search';
            searchButton.onclick = handleSearch;

            const magicButton = document.createElement('button');
            magicButton.className = 'dd-search-button';
            magicButton.innerHTML = '🔮';
            magicButton.title = 'Magic Search';
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

            titleBar.appendChild(searchBar);
            titleBar.appendChild(searchButton);
            titleBar.appendChild(magicButton);
            titleBar.appendChild(prevButton);
            titleBar.appendChild(nextButton);
            titleBar.appendChild(loadingSpinner);

            // Event listeners
            searchBar.addEventListener('input', debounce(handleSearch, 300));
            searchBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleSearch();
                if (e.key === 'ArrowDown') navigateResults(1);
                if (e.key === 'ArrowUp') navigateResults(-1);
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
                const widget = document.getElementById(id);
                if (widget && widget.classList.contains('dashboard_widget')) {
                    widget.classList.remove('widget-filtered-out');
                    widget.classList.add('widget-filtered-in');
                    widget.style.display = '';
                    console.log('DD Search: Showing widget:', id);
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
                    title: result.item.title
                };
            });

            return mappedResults;
        }

        function displaySearchResults(results) {
            currentResults = results;
            let resultList = document.getElementById('search-results');
            if (!resultList) {
                resultList = document.createElement('ul');
                resultList.id = 'search-results';
                if (titleBar) {
                    titleBar.appendChild(resultList);
                } else {
                    document.body.appendChild(resultList);
                }
            }

            // Clear previous results
            resultList.innerHTML = '';

            if (!results || results.length === 0) {
                const noResults = document.createElement('li');
                noResults.textContent = 'No results found';
                noResults.style.fontStyle = 'italic';
                noResults.style.color = '#666';
                resultList.appendChild(noResults);
                updateMatchCount(0);
                return;
            }

            results.forEach((result, index) => {
                const listItem = document.createElement('li');

                // Vérifier si c'est un résultat de magic search (contient " : ")
                if (result.title.includes(' : ')) {
                    const parts = result.title.split(': ');
                    const widgetName = parts[0];
                    const explanation = parts.slice(1).join(': ');
                    listItem.innerHTML = `<span class="widget-name">${widgetName}</span> : <span class="widget-explanation">${explanation}</span>`;
                    listItem.style.fontWeight = 'normal'; // Override le CSS global pour ce cas
                } else {
                    listItem.textContent = result.title;
                }

                listItem.onclick = () => focusOnWidget(index);
                resultList.appendChild(listItem);
            });
            updateMatchCount(results.length);
        }

        function scrollToElement(element) {
            const titleBar = document.querySelector('.title_bar');
            const headerOffset = titleBar ? titleBar.offsetHeight : 0;
            const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
            const offsetPosition = elementPosition - headerOffset;

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
            const targetWidget = document.getElementById(targetWidgetId);

            if (targetWidget) {
                scrollToElement(targetWidget);

                // Highlight SEULEMENT le titre du widget
                const titleElement = targetWidget.querySelector('h3, h2, h1, .title, [data-testid*="title"]');
                if (titleElement) {
                    titleElement.classList.add('highlight');
                }
            }
        }

        function navigateResults(step) {
            if (!currentResults || currentResults.length === 0) return;

            currentIndex = (currentIndex + step + currentResults.length) % currentResults.length;
            focusOnWidget(currentIndex);
        }

        function updateMatchCount(count) {
            let countDisplay = document.getElementById('match-count');
            if (!countDisplay) {
                countDisplay = document.createElement('div');
                countDisplay.id = 'match-count';
                if (titleBar) {
                    titleBar.appendChild(countDisplay);
                } else {
                    document.body.appendChild(countDisplay);
                }
            }
            countDisplay.textContent = count + ' results';
        }

        function parseWidgets() {
            // Parse dashboard widgets and store data (comme Lucas Verdonk)
            const widgets = document.querySelectorAll('.dashboard_widget');
            const widgetData = [];

            widgets.forEach(widget => {
                const id = widget.id;
                waitForElement('h3', widget, function (titleElement) {
                    const title = titleElement?.textContent || 'notitle';
                    if (title !== 'notitle') {
                        widgetData.push({id, title});
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
                            widgetData.push({id, title});
                            localStorage.setItem('widgetData', JSON.stringify(widgetData));
                        }
                    }
                }
            });

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

        // CSS minimal
        const style = document.createElement('style');
        style.textContent = `.dd-search-highlight { background-color: #ffeb3b !important; border: 2px solid #ff9800 !important; border-radius: 4px !important; }`;
        document.head.appendChild(style);

        // Initialisation
        addCss();

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

        let titleBarFound = false;

        // Try each selector
        titleBarSelectors.forEach(selector => {
            if (!titleBarFound) {
                waitForElement(selector, document, function (t) {
                    if (!titleBarFound) {
                        titleBar = t;
                        titleBarFound = true;
                        console.log('DD Search: Found title bar with selector:', selector);
                        createUI(titleBar);
                        parseWidgets();
                    }
                }, 5, 300); // Shorter timeout per selector
            }
        });

        // If no title bar found, wait longer and try again
        setTimeout(() => {
            if (!titleBarFound) {
                console.log('DD Search: No title bar found, trying again...');
                // Try again with a longer wait
                waitForElement('.title_bar', document, function (t) {
                    titleBar = t;
                    titleBarFound = true;
                    console.log('DD Search: Found title bar on second try');
                    createUI(titleBar);
                    parseWidgets();
                }, 10, 1000);
            }
        }, 3000);

    })();