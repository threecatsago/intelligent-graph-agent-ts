const API_BASE = '/api';

// Send message
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const sessionId = document.getElementById('sessionId').value;
    const message = messageInput.value.trim();
    const streamMode = document.getElementById('streamMode')?.checked || false;
    
    if (!message) return;
    
    // Add user message to chat area
    addMessage('user', message);
    messageInput.value = '';
    
    try {
        if (streamMode) {
            // Streaming response mode
            await sendMessageStream(message, sessionId);
        } else {
            // Normal response mode
            await sendMessageNormal(message, sessionId);
        }
    } catch (error) {
        addMessage('assistant', 'Network error, please try again later.');
        console.error('Failed to send message:', error);
    }
}

// Normal message sending
async function sendMessageNormal(message, sessionId) {
    const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, stream: false })
    });
    
    const data = await response.json();
    
    if (data.success) {
        addMessage('assistant', data.data.answer);
    } else {
        addMessage('assistant', 'Sorry, an error occurred while processing your message.');
    }
}

// Streaming message sending
async function sendMessageStream(message, sessionId) {
    // Create assistant message container
    const messageId = 'msg_' + Date.now();
    addMessage('assistant', '', messageId);
    
    try {
        const response = await fetch(`${API_BASE}/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId, stream: true })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            assistantMessage += chunk;
            
            // Update message content
            updateMessageContent(messageId, assistantMessage);
        }
        
        // Add reference data formatting
        if (assistantMessage.includes('Reference data')) {
            formatReferences(messageId, assistantMessage);
        }
        
    } catch (error) {
        console.error('Streaming response failed:', error);
        updateMessageContent(messageId, 'Sorry, an error occurred while generating the response. Please try again later.');
    }
}

// Add message to chat area
function addMessage(role, content, messageId = null) {
    const chatArea = document.getElementById('chatArea');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    if (messageId) {
        messageDiv.id = messageId;
    }
    
    if (role === 'assistant' && messageId) {
        // Reserve space for streaming response
        messageDiv.innerHTML = '<div class="typing-indicator">Thinking...</div>';
    } else {
        messageDiv.textContent = content;
    }
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// Update message content
function updateMessageContent(messageId, content) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        messageDiv.innerHTML = content.replace(/\n/g, '<br>');
        messageDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

// Format reference data
function formatReferences(messageId, content) {
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        // Format reference data in a more beautiful style
        let formattedContent = content;
        
        // Format reference data section
        formattedContent = formattedContent.replace(
            /### Reference data\n(.*?)$/s,
            '<div class="references-section"><h4>📚 Reference data</h4><div class="references-content">$1</div></div>'
        );
        
        // Format code blocks
        formattedContent = formattedContent.replace(
            /```([\s\S]*?)```/g,
            '<pre><code>$1</code></pre>'
        );
        
        // Format bold text
        formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Format italic text
        formattedContent = formattedContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        messageDiv.innerHTML = formattedContent.replace(/\n/g, '<br>');
    }
}

// Check Gemini service status
async function checkGeminiStatus() {
    try {
        const response = await fetch(`${API_BASE}/chat/gemini/status`);
        const data = await response.json();
        
        if (data.success) {
            const status = data.data;
            updateGeminiStatus(status);
        }
    } catch (error) {
        console.error('Failed to check Gemini status:', error);
        updateGeminiStatus({ isAvailable: false, modelInfo: null });
    }
}

// Update Gemini status display
function updateGeminiStatus(status) {
    const statusElement = document.getElementById('geminiStatus');
    if (statusElement) {
        if (status.isAvailable) {
            statusElement.innerHTML = `
                <span class="status-indicator available">🟢 Gemini available</span>
                <small>Model: ${status.modelInfo.name}</small>
            `;
        } else {
            statusElement.innerHTML = `
                <span class="status-indicator unavailable">🔴 Gemini unavailable</span>
                <small>${status.lastError || 'Please check API key configuration'}</small>
            `;
        }
    }
}

// Perform unified search
async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchStrategy = document.getElementById('searchStrategy').value;
    const query = searchInput.value.trim();
    
    if (!query) return;
    
    try {
        const endpoint = `${API_BASE}/search/search`;
        const requestBody = { 
            query, 
            limit: 10,
            strategy: searchStrategy
        };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        displaySearchResults(data);
        
        // Display search strategy information
        const strategyInfo = getStrategyInfo(searchStrategy);
        showStatus(`Search completed using ${strategyInfo.name} strategy`, 'success');
        
    } catch (error) {
        showStatus('Search failed, please try again later.', 'error');
        console.error('Search error:', error);
    }
}

// Get strategy information
function getStrategyInfo(strategyName) {
    const strategies = {
        'vector-only': { name: 'Vector Only', description: 'Only use vector search, suitable for semantic queries' },
        'hybrid-vector-heavy': { name: 'Hybrid Vector Heavy', description: 'Hybrid search with vector search as primary, suitable for complex semantic queries' },
        'vector-with-context': { name: 'Vector with Context', description: 'Vector search + context expansion, provides more complete answer context' }
    };
    return strategies[strategyName] || { name: 'Unknown', description: 'Unknown strategy' };
}

// Display search results
function displaySearchResults(data) {
    const resultsArea = document.getElementById('searchResults');
    
    // Add debug information
    console.log('🔍 Received search data:', data);
    console.log('📊 Data structure check:', {
        success: data.success,
        hasData: !!data.data,
        hasResults: !!(data.data && data.data.results),
        resultsLength: data.data?.results?.length || 0,
        resultsType: typeof data.data?.results,
        firstResult: data.data?.results?.[0]
    });
    
    if (!data.success || data.data.results.length === 0) {
        resultsArea.innerHTML = '<div class="result-item">No relevant results found</div>';
        return;
    }
    
    let html = '';
    data.data.results.forEach((result, index) => {
        const content = result.content.length > 100 ? 
            result.content.substring(0, 100) + '...' : result.content;
        
        // Display search strategy information
        const searchMethod = result.metadata?.searchMethod || 'vector';
        const methodBadge = `<span class="method-badge ${searchMethod}">${searchMethod}</span>`;
        
        html += `
            <div class="result-item">
                <div class="result-title">
                    Result ${index + 1} (Relevance: ${(result.score * 100).toFixed(1)}%) ${methodBadge}
                </div>
                <div class="result-content">${content}</div>
                <small style="color: #6c757d;">Source: ${result.source}</small>
                ${result.metadata?.chunkId ? `<small style="color: #6c757d;">Chunk ID: ${result.metadata.chunkId}</small>` : ''}
            </div>
        `;
    });
    
    resultsArea.innerHTML = html;
}

// Perform smart QA using unified search
async function performSmartQA() {
    const questionInput = document.getElementById('questionInput');
    const question = questionInput.value.trim();
    
    if (!question) return;
    
    try {
        // Show loading status
        const qaResultsArea = document.getElementById('qaResults');
        qaResultsArea.innerHTML = '<div class="loading">🤖 AI is thinking...</div>';
        
        const endpoint = `${API_BASE}/search/qa`;
        const requestBody = { 
            question,
            options: {
                topK: 5,
                threshold: 0.6
            }
        };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        displayQAResults(data);
        
        showStatus('Smart QA completed successfully!', 'success');
        
    } catch (error) {
        showStatus('Smart QA failed, please try again later.', 'error');
        console.error('Smart QA error:', error);
        document.getElementById('qaResults').innerHTML = '<div class="error">❌ Smart QA failed, please try again</div>';
    }
}

// Display QA results
function displayQAResults(data) {
    const qaResultsArea = document.getElementById('qaResults');
    
    if (!data.success) {
        qaResultsArea.innerHTML = '<div class="error">❌ QA failed</div>';
        return;
    }
    
    const result = data.data;
    let html = `
        <div class="qa-result">
            <div class="qa-answer">
                <h4>🤖 AI Answer</h4>
                <div class="answer-content">${result.answer}</div>
                <div class="confidence">Confidence: ${(result.confidence * 100).toFixed(1)}%</div>
            </div>
            
            <div class="qa-sources">
                <h4>📚 Reference Sources (${result.searchResults.length})</h4>
                ${result.searchResults.map((source, index) => `
                    <div class="source-item">
                        <div class="source-title">Source ${index + 1}: ${source.source}</div>
                        <div class="source-content">${source.content.substring(0, 150)}...</div>
                        <small style="color: #6c757d;">Relevance: ${(source.score * 100).toFixed(1)}%</small>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    qaResultsArea.innerHTML = html;
}

// Refresh statistics
async function refreshStats() {
    try {
        const response = await fetch(`${API_BASE}/graph/stats`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.data;
            document.querySelector('.stat-card:nth-child(1) .stat-number').textContent = stats.totalNodes.low;
            document.querySelector('.stat-card:nth-child(2) .stat-number').textContent = stats.totalRelationships.low;
            
            const docCount = stats.nodeStats.find(s => s.labels.includes('__Document__'))?.count.low || 0;
            const chunkCount = stats.nodeStats.find(s => s.labels.includes('__Chunk__'))?.count.low || 0;
            
            document.querySelector('.stat-card:nth-child(3) .stat-number').textContent = docCount;
            document.querySelector('.stat-card:nth-child(4) .stat-number').textContent = chunkCount;
        }
    } catch (error) {
        showStatus('Failed to get statistics', 'error');
    }
}

// Build knowledge graph
async function buildGraph() {
    const directoryPath = document.getElementById('directoryPath').value.trim();
    
    if (!directoryPath) {
        showStatus('Please enter document directory path', 'error');
        return;
    }
    
    showStatus('Building knowledge graph...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/graph/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputPath: directoryPath, rebuild: false })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('Knowledge graph built successfully!', 'success');
            refreshStats();
        } else {
            showStatus('Build failed: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Build failed, please check if the path is correct', 'error');
    }
}

// Clear session
async function clearSession() {
    const sessionId = document.getElementById('sessionId').value;
    
    try {
        await fetch(`${API_BASE}/chat/session/${sessionId}`, { method: 'DELETE' });
        document.getElementById('chatArea').innerHTML = `
            <div class="message assistant-message">
                Session cleared! I'm your intelligent assistant, ready to help you search and answer questions about stored documents.
            </div>
        `;
        showStatus('Session cleared', 'success');
    } catch (error) {
        showStatus('Failed to clear session', 'error');
    }
}

// Show status information
function showStatus(message, type) {
    const statusArea = document.getElementById('statusArea');
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    statusArea.innerHTML = '';
    statusArea.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.remove();
    }, 5000);
}

// File upload functionality
async function uploadFiles() {
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    
    if (files.length === 0) {
        showStatus('Please select files to upload', 'error');
        return;
    }
    
    // Check file size
    for (let i = 0; i < files.length; i++) {
        if (files[i].size > 10 * 1024 * 1024) {
            showStatus(`File ${files[i].name} exceeds 10MB limit`, 'error');
            return;
        }
    }
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    showStatus('Uploading files...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/upload/files`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(data.message, 'success');
            fileInput.value = ''; // Clear file selection
            refreshUploadedFiles(); // Refresh file list
            refreshStats(); // Refresh statistics
        } else {
            showStatus(data.message, 'error');
        }
    } catch (error) {
        showStatus('File upload failed, please try again later', 'error');
    }
}

// Refresh uploaded files list
async function refreshUploadedFiles() {
    try {
        const response = await fetch(`${API_BASE}/upload/files`);
        const data = await response.json();
        
        if (data.success) {
            displayUploadedFiles(data.data.files);
        }
    } catch (error) {
        console.error('Failed to get file list:', error);
    }
}

// Display uploaded files list
function displayUploadedFiles(files) {
    const filesList = document.getElementById('filesList');
    
    if (files.length === 0) {
        filesList.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 20px;">No uploaded files</div>';
        return;
    }
    
    let html = '';
    files.forEach(file => {
        const uploadTime = new Date(file.uploadTime).toLocaleString('zh-CN');
        html += `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${file.filename}</div>
                    <div class="file-meta">Size: ${file.sizeFormatted} | Upload Time: ${uploadTime}</div>
                </div>
                <div class="file-actions">
                    <button class="btn-small btn-danger" onclick="deleteFile('${file.filename}')">Delete</button>
                </div>
            </div>
        `;
    });
    
    filesList.innerHTML = html;
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete file ${filename}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/upload/files/${filename}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('File deleted successfully', 'success');
            refreshUploadedFiles();
        } else {
            showStatus('Failed to delete file', 'error');
        }
    } catch (error) {
        showStatus('Failed to delete file, please try again later', 'error');
    }
}

// Clear all uploaded files
async function clearUploadedFiles() {
    if (!confirm('Are you sure you want to clear all uploaded files? This action cannot be undone!')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/upload/files`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('All files cleared', 'success');
            refreshUploadedFiles();
        } else {
            showStatus('Failed to clear files', 'error');
        }
    } catch (error) {
        showStatus('Failed to clear files, please try again later', 'error');
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // File drag and drop upload
    const fileUpload = document.querySelector('.file-upload');
    
    fileUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUpload.style.borderColor = '#4facfe';
    });
    
    fileUpload.addEventListener('dragleave', () => {
        fileUpload.style.borderColor = '#dee2e6';
    });
    
    fileUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUpload.style.borderColor = '#dee2e6';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // File upload logic can be added here
            showStatus(`Detected ${files.length} files`, 'info');
        }
    });
    
    // Enter to send message
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Enter to perform search
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Initialize after page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize search options interaction
    initializeSearchOptions();
    
    // Refresh statistics
    refreshStats();
    
    // Check Gemini status
    checkGeminiStatus();
});

// Initialize search strategies
function initializeSearchOptions() {
    // Get available search strategies
    fetch(`${API_BASE}/search/strategies`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const strategySelect = document.getElementById('searchStrategy');
                strategySelect.innerHTML = '';
                
                data.data.forEach(strategy => {
                    const option = document.createElement('option');
                    option.value = strategy.name;
                    option.textContent = `${strategy.name}: ${strategy.description}`;
                    strategySelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Failed to load search strategies:', error);
        });
} 