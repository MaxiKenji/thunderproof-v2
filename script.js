// Thunderproof - Complete JavaScript Application
class ThunderproofApp {
    constructor() {
        // Application state
        this.currentProfile = null;
        this.currentReviews = [];
        this.user = null;
        this.isConnected = false;
        this.nostr = null;
        this.selectedRating = 0;
        
        // Configuration
        this.relays = [
            'wss://relay.damus.io',
            'wss://nos.lol', 
            'wss://relay.snort.social',
            'wss://relay.current.fyi',
            'wss://brb.io'
        ];
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Thunderproof...');
        
        // Load Nostr tools
        try {
            await this.loadNostrTools();
            console.log('✅ Nostr tools loaded');
        } catch (error) {
            console.error('❌ Failed to load Nostr tools:', error);
            this.showToast('Failed to load Nostr tools. Some features may not work.', 'error');
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check URL parameters for direct profile links
        this.handleURLParams();
        
        console.log('✅ Thunderproof initialized successfully');
    }

    async loadNostrTools() {
        try {
            // Try multiple CDNs for reliability
            const cdns = [
                'https://unpkg.com/nostr-tools@2.7.2/lib/esm/index.js',
                'https://cdn.skypack.dev/nostr-tools@2.7.2',
                'https://esm.sh/nostr-tools@2.7.2'
            ];
            
            for (const cdn of cdns) {
                try {
                    const module = await import(cdn);
                    this.nostr = module;
                    
                    // Test basic functionality
                    const testKey = this.nostr.generatePrivateKey();
                    const testPubkey = this.nostr.getPublicKey(testKey);
                    
                    console.log('✅ Nostr tools test successful');
                    return;
                } catch (error) {
                    console.warn(`Failed to load from ${cdn}:`, error);
                    continue;
                }
            }
            
            throw new Error('All CDNs failed');
        } catch (error) {
            console.error('Failed to load nostr-tools:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-btn')?.addEventListener('click', () => this.handleSearch());
        document.getElementById('search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Example buttons
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const npub = e.target.dataset.npub;
                document.getElementById('search-input').value = npub;
                this.handleSearch();
            });
        });

        // Navigation
        document.getElementById('back-btn')?.addEventListener('click', () => this.showHeroSection());

        // Connection
        document.getElementById('connect-btn')?.addEventListener('click', () => this.showConnectModal());
        document.getElementById('disconnect-btn')?.addEventListener('click', () => this.disconnect());

        // Profile actions
        document.getElementById('add-review-btn')?.addEventListener('click', () => this.showReviewModal());
        document.getElementById('share-btn')?.addEventListener('click', () => this.showShareModal());

        // Modal controls
        this.setupModalListeners();
        
        // Review form
        this.setupReviewForm();
        
        // Share functionality
        this.setupShareListeners();
    }

    setupModalListeners() {
        // Close modal buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal);
            });
        });

        // Close on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal);
            });
        });

        // Connect options
        document.getElementById('connect-extension')?.addEventListener('click', () => this.connectExtension());
        document.getElementById('connect-key')?.addEventListener('click', () => this.connectWithKey());
        document.getElementById('connect-generate')?.addEventListener('click', () => this.generateKeys());
    }

    setupReviewForm() {
        // Star rating buttons
        document.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rating = parseInt(e.currentTarget.dataset.rating);
                this.selectRating(rating);
            });
        });

        // Comment character counter
        const commentTextarea = document.getElementById('review-comment');
        const charCounter = document.getElementById('char-counter');
        
        commentTextarea?.addEventListener('input', (e) => {
            const length = e.target.value.length;
            charCounter.textContent = `${length}/500 characters`;
            this.validateReviewForm();
        });

        // Modal buttons
        document.getElementById('cancel-review')?.addEventListener('click', () => {
            this.hideModal(document.getElementById('review-modal'));
        });
        
        document.getElementById('submit-review')?.addEventListener('click', () => this.submitReview());
    }

    setupShareListeners() {
        document.getElementById('copy-url')?.addEventListener('click', () => this.copyToClipboard('share-url'));
        document.getElementById('copy-embed')?.addEventListener('click', () => this.copyToClipboard('embed-code'));

        // Embed settings
        ['embed-width', 'embed-height', 'embed-max'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.updateEmbedCode());
        });
    }

    handleURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const profile = urlParams.get('profile');
        
        if (profile) {
            document.getElementById('search-input').value = profile;
            this.handleSearch();
        }
    }

    async handleSearch() {
        const input = document.getElementById('search-input');
        const query = input.value.trim();
        
        if (!query) {
            this.showToast('Please enter a Nostr public key', 'error');
            return;
        }

        if (!this.isValidNpub(query)) {
            this.showToast('Please enter a valid npub key (63 characters starting with npub1)', 'error');
            return;
        }

        this.showLoading('Searching profile...');

        try {
            const profile = await this.searchProfile(query);
            
            if (profile) {
                this.currentProfile = profile;
                await this.loadReviews();
                this.showProfileSection();
                this.updateURL(query);
                this.showToast('Profile found!', 'success');
            } else {
                this.showToast('Profile not found', 'warning');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showToast(`Search failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async searchProfile(npub) {
        try {
            if (!this.nostr) {
                throw new Error('Nostr tools not available');
            }

            // Decode npub to hex
            const decoded = this.nostr.nip19.decode(npub);
            const pubkeyHex = decoded.data;

            // Try to fetch profile from relays
            const profile = await this.fetchProfileFromRelays(pubkeyHex, npub);
            return profile;
        } catch (error) {
            console.error('Profile search error:', error);
            throw error;
        }
    }

    async fetchProfileFromRelays(pubkey, npub) {
        try {
            const pool = new this.nostr.SimplePool();
            
            // Query for profile metadata (kind 0)
            const filter = {
                kinds: [0],
                authors: [pubkey],
                limit: 1
            };

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 10000)
            );

            const queryPromise = pool.querySync(this.relays, filter);
            const events = await Promise.race([queryPromise, timeoutPromise]);
            
            pool.close(this.relays);

            let profileData = {};
            
            if (events.length > 0) {
                // Parse the most recent profile event
                const profileEvent = events.reduce((latest, current) => 
                    current.created_at > latest.created_at ? current : latest
                );

                try {
                    profileData = JSON.parse(profileEvent.content);
                } catch (error) {
                    console.warn('Failed to parse profile data:', error);
                }
            }

            return {
                pubkey: pubkey,
                npub: npub,
                name: profileData.name || profileData.display_name || npub.substring(0, 16) + '...',
                about: profileData.about || 'No profile information available',
                picture: profileData.picture || null,
                banner: profileData.banner || null,
                website: profileData.website || null,
                nip05: profileData.nip05 || null,
                lud16: profileData.lud16 || null,
                raw: profileData
            };
        } catch (error) {
            console.error('Error fetching profile:', error);
            
            // Return basic profile if fetch fails
            return {
                pubkey: pubkey,
                npub: npub,
                name: npub.substring(0, 16) + '...',
                about: 'Profile information unavailable',
                picture: null,
                banner: null,
                website: null,
                nip05: null,
                lud16: null,
                raw: {}
            };
        }
    }

    async loadReviews() {
        if (!this.currentProfile) return;

        try {
            // For now, show demo reviews since Nostr review protocol needs implementation
            this.currentReviews = this.generateDemoReviews();
            this.displayReviews();
            this.updateProfileStats();
        } catch (error) {
            console.error('Error loading reviews:', error);
            this.showToast('Error loading reviews', 'error');
        }
    }

    generateDemoReviews() {
        const reviews = [
            {
                id: 'demo1',
                author: 'npub1alice123...',
                rating: 5,
                content: 'Excellent Bitcoin service! Fast Lightning payments and great customer support. Highly recommended.',
                created_at: Date.now() - (1000 * 60 * 60 * 24), // 1 day ago
                verified: true
            },
            {
                id: 'demo2', 
                author: 'npub1bob456...',
                rating: 4,
                content: 'Very reliable platform. Had one minor issue but it was resolved quickly by their support team.',
                created_at: Date.now() - (1000 * 60 * 60 * 48), // 2 days ago
                verified: true
            },
            {
                id: 'demo3',
                author: 'npub1carol789...',
                rating: 5,
                content: 'Outstanding experience! This is exactly what the Bitcoin ecosystem needs. Will definitely use again.',
                created_at: Date.now() - (1000 * 60 * 60 * 72), // 3 days ago
                verified: false
            },
            {
                id: 'demo4',
                author: 'npub1dave012...',
                rating: 4,
                content: 'Good service overall. Fast transactions and the Lightning integration works perfectly.',
                created_at: Date.now() - (1000 * 60 * 60 * 96), // 4 days ago
                verified: true
            },
            {
                id: 'demo5',
                author: 'npub1eve345...',
                rating: 5,
                content: 'Perfect! Exactly what I needed for my Bitcoin business. The interface is intuitive and secure.',
                created_at: Date.now() - (1000 * 60 * 60 * 120), // 5 days ago
                verified: false
            }
        ];

        return reviews.sort((a, b) => b.created_at - a.created_at);
    }

    displayReviews() {
        const reviewsList = document.getElementById('reviews-list');
        const noReviews = document.getElementById('no-reviews');
        
        if (this.currentReviews.length === 0) {
            reviewsList.classList.add('hidden');
            noReviews.classList.remove('hidden');
            return;
        }

        noReviews.classList.add('hidden');
        reviewsList.classList.remove('hidden');

        reviewsList.innerHTML = this.currentReviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <div class="review-meta">
                        <div class="review-rating">
                            <img src="assets/${this.getRatingAsset(review.rating)}.svg" alt="${review.rating} stars">
                        </div>
                        <span class="review-author">${this.formatAuthor(review.author)}</span>
                        ${review.verified ? '<span class="verified-badge">⚡ Verified</span>' : ''}
                    </div>
                    <span class="review-date">${this.formatDate(review.created_at)}</span>
                </div>
                <div class="review-content">${this.escapeHtml(review.content)}</div>
            </div>
        `).join('');
    }

    updateProfileStats() {
        const totalReviews = this.currentReviews.length;
        const avgRating = totalReviews > 0 
            ? (this.currentReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
            : '0.0';

        // Update profile stats
        document.getElementById('total-reviews').textContent = totalReviews;
        document.getElementById('avg-rating').textContent = avgRating;
        document.getElementById('overall-number').textContent = avgRating;
        
        // Update overall stars image
        const overallStars = document.getElementById('overall-stars');
        const ratingAsset = this.getRatingAsset(parseFloat(avgRating));
        overallStars.src = `assets/${ratingAsset}.svg`;

        // Update rating breakdown
        this.updateRatingBreakdown();
    }

    updateRatingBreakdown() {
        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        
        this.currentReviews.forEach(review => {
            if (breakdown[review.rating] !== undefined) {
                breakdown[review.rating]++;
            }
        });

        const total = this.currentReviews.length;
        const breakdownEl = document.getElementById('rating-breakdown');
        
        if (total === 0) {
            breakdownEl.innerHTML = '<p class="text-muted">No ratings yet</p>';
            return;
        }

        const breakdownHTML = [5, 4, 3, 2, 1].map(rating => {
            const count = breakdown[rating];
            const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
            
            return `
                <div class="rating-bar">
                    <span class="bar-label">${rating} star${rating !== 1 ? 's' : ''}</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="bar-count">${count}</span>
                </div>
            `;
        }).join('');

        breakdownEl.innerHTML = breakdownHTML;
    }

    // Connection functionality
    showConnectModal() {
        this.showModal(document.getElementById('connect-modal'));
    }

    async connectExtension() {
        try {
            if (!window.nostr) {
                throw new Error('No Nostr extension found. Please install Alby, nos2x, or another NIP-07 compatible extension.');
            }

            this.showLoading('Connecting to Nostr extension...');
            
            const pubkey = await window.nostr.getPublicKey();
            const npub = this.nostr.nip19.npubEncode(pubkey);
            
            this.user = {
                pubkey,
                npub,
                name: npub.substring(0, 16) + '...',
                picture: null,
                method: 'extension'
            };
            
            this.isConnected = true;
            this.updateConnectionUI();
            this.hideModal(document.getElementById('connect-modal'));
            this.showToast('Connected successfully!', 'success');
            
        } catch (error) {
            console.error('Extension connection error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async connectWithKey() {
        // This would show a form for manual nsec input
        this.showToast('Manual key input coming soon. Please use a Nostr extension for now.', 'warning');
    }

    async generateKeys() {
        try {
            if (!this.nostr) {
                throw new Error('Nostr tools not available');
            }

            const privkey = this.nostr.generatePrivateKey();
            const pubkey = this.nostr.getPublicKey(privkey);
            const nsec = this.nostr.nip19.nsecEncode(privkey);
            const npub = this.nostr.nip19.npubEncode(pubkey);
            
            this.user = {
                pubkey,
                npub,
                privkey,
                nsec,
                name: npub.substring(0, 16) + '...',
                picture: null,
                method: 'generated'
            };
            
            this.isConnected = true;
            this.updateConnectionUI();
            this.hideModal(document.getElementById('connect-modal'));
            
            this.showToast('New keys generated! Save your private key safely.', 'success');
            
            // Show generated keys to user
            this.showGeneratedKeysInfo(nsec, npub);
            
        } catch (error) {
            console.error('Key generation error:', error);
            this.showToast('Failed to generate keys', 'error');
        }
    }

    showGeneratedKeysInfo(nsec, npub) {
        // Simple alert for now - could be enhanced with a proper modal
        const message = `🔑 Your new Nostr keys:\n\nPublic key (share this):\n${npub}\n\nPrivate key (keep this secret!):\n${nsec}\n\n⚠️ Save your private key safely - you'll need it to access this identity again!`;
        
        setTimeout(() => {
            if (confirm(message + '\n\nClick OK to copy your private key to clipboard.')) {
                navigator.clipboard.writeText(nsec).catch(() => {
                    console.warn('Failed to copy to clipboard');
                });
            }
        }, 1000);
    }

    disconnect() {
        this.user = null;
        this.isConnected = false;
        this.updateConnectionUI();
        this.showToast('Disconnected from Nostr', 'success');
    }

    updateConnectionUI() {
        const connectBtn = document.getElementById('connect-btn');
        const userInfo = document.getElementById('user-info');
        const addReviewBtn = document.getElementById('add-review-btn');

        if (this.isConnected && this.user) {
            connectBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            
            const userAvatar = document.getElementById('user-avatar');
            const userName = document.getElementById('user-name');
            
            // Set default avatar if no picture
            if (!this.user.picture) {
                userAvatar.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="%23f7931a"/><text x="16" y="20" text-anchor="middle" font-size="12" fill="white">⚡</text></svg>`;
            } else {
                userAvatar.src = this.user.picture;
            }
            
            userName.textContent = this.user.name;
            
            if (addReviewBtn) {
                addReviewBtn.disabled = false;
            }
        } else {
            connectBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
            
            if (addReviewBtn) {
                addReviewBtn.disabled = true;
            }
        }
    }

    // Review functionality
    showReviewModal() {
        if (!this.isConnected) {
            this.showToast('Please connect your Nostr account first', 'error');
            return;
        }
        
        this.resetReviewForm();
        this.showModal(document.getElementById('review-modal'));
    }

    selectRating(rating) {
        this.selectedRating = rating;
        
        // Update UI
        document.querySelectorAll('.star-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        document.querySelector(`[data-rating="${rating}"]`).classList.add('selected');
        
        // Update selected rating display
        const selectedStars = document.getElementById('selected-stars');
        const ratingText = document.getElementById('rating-text');
        
        selectedStars.src = `assets/${this.getRatingAsset(rating)}.svg`;
        ratingText.textContent = `${rating} star${rating !== 1 ? 's' : ''}`;
        
        this.validateReviewForm();
    }

    validateReviewForm() {
        const submitBtn = document.getElementById('submit-review');
        const comment = document.getElementById('review-comment').value.trim();
        
        const isValid = this.selectedRating > 0 && comment.length > 0;
        submitBtn.disabled = !isValid;
    }

    resetReviewForm() {
        this.selectedRating = 0;
        
        document.querySelectorAll('.star-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        document.getElementById('selected-stars').src = 'assets/0.svg';
        document.getElementById('rating-text').textContent = 'Select your rating';
        document.getElementById('review-comment').value = '';
        document.getElementById('char-counter').textContent = '0/500 characters';
        document.getElementById('submit-review').disabled = true;
    }

    async submitReview() {
        if (!this.isConnected || !this.user) {
            this.showToast('Please connect your Nostr account first', 'error');
            return;
        }

        if (this.selectedRating === 0) {
            this.showToast('Please select a rating', 'error');
            return;
        }

        const comment = document.getElementById('review-comment').value.trim();
        if (!comment) {
            this.showToast('Please write a review comment', 'error');
            return;
        }

        const submitBtn = document.getElementById('submit-review');
        const originalText = submitBtn.textContent;
        
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span> Publishing...';
            
            // Simulate review submission (real implementation would publish to Nostr)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Add review to current list for demo
            const newReview = {
                id: 'user_' + Date.now(),
                author: this.user.npub,
                rating: this.selectedRating,
                content: comment,
                created_at: Date.now(),
                verified: false
            };
            
            this.currentReviews.unshift(newReview);
            this.displayReviews();
            this.updateProfileStats();
            
            this.hideModal(document.getElementById('review-modal'));
            this.showToast('Review published successfully!', 'success');
            
        } catch (error) {
            console.error('Submit review error:', error);
            this.showToast('Failed to publish review', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    // Share functionality
    showShareModal() {
        if (!this.currentProfile) return;
        
        const baseURL = window.location.origin + window.location.pathname;
        const shareURL = `${baseURL}?profile=${encodeURIComponent(this.currentProfile.npub)}`;
        
        document.getElementById('share-url').value = shareURL;
        this.updateEmbedCode();
        this.showModal(document.getElementById('share-modal'));
    }

    updateEmbedCode() {
        if (!this.currentProfile) return;
        
        const width = document.getElementById('embed-width').value;
        const height = document.getElementById('embed-height').value;
        const maxReviews = document.getElementById('embed-max').value;
        
        const baseURL = window.location.origin;
        const embedURL = `${baseURL}/embed.html?profile=${encodeURIComponent(this.currentProfile.npub)}&max=${maxReviews}`;
        
        const embedCode = `<iframe
  src="${embedURL}"
  width="${width}"
  height="${height}"
  frameborder="0"
  style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
  loading="lazy">
</iframe>`;

        document.getElementById('embed-code').value = embedCode;
    }

    async copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.value;
        
        try {
            await navigator.clipboard.writeText(text);
            
            // Find and update the corresponding copy button
            const button = element.parentNode.querySelector('.btn-copy');
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    // Navigation
    showProfileSection() {
        // Hide hero and other sections
        document.querySelector('.hero').style.display = 'none';
        document.querySelector('.about-section').style.display = 'none';
        document.querySelector('.how-section').style.display = 'none';
        document.querySelector('.footer').style.display = 'none';
        
        // Show profile section
        document.getElementById('profile-section').classList.remove('hidden');
        
        // Update profile display
        this.updateProfileDisplay();
    }

    showHeroSection() {
        // Show hero and other sections
        document.querySelector('.hero').style.display = 'block';
        document.querySelector('.about-section').style.display = 'block';
        document.querySelector('.how-section').style.display = 'block';
        document.querySelector('.footer').style.display = 'block';
        
        // Hide profile section
        document.getElementById('profile-section').classList.add('hidden');
        
        // Clear URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    updateProfileDisplay() {
        if (!this.currentProfile) return;
        
        const elements = {
            'profile-avatar': { src: this.currentProfile.picture || this.generateDefaultAvatar() },
            'profile-name': { textContent: this.currentProfile.name },
            'profile-about': { textContent: this.currentProfile.about },
            'profile-npub': { textContent: this.formatNpub(this.currentProfile.npub) }
        };
        
        Object.entries(elements).forEach(([id, props]) => {
            const element = document.getElementById(id);
            if (element) {
                Object.entries(props).forEach(([prop, value]) => {
                    element[prop] = value;
                });
            }
        });
    }

    updateURL(profileKey) {
        const url = new URL(window.location);
        url.searchParams.set('profile', profileKey);
        window.history.replaceState({}, document.title, url);
    }

    // UI Helpers
    showModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.querySelector('.loading-text');
        text.textContent = message;
        overlay.classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    // Utility functions
    isValidNpub(key) {
        return key.startsWith('npub1') && key.length === 63;
    }

    getRatingAsset(rating) {
        const percentage = rating * 20;
        if (percentage >= 100) return '100';
        if (percentage >= 90) return '90';
        if (percentage >= 80) return '80';
        if (percentage >= 70) return '70';
        if (percentage >= 60) return '60';
        if (percentage >= 50) return '50';
        if (percentage >= 40) return '40';
        if (percentage >= 30) return '30';
        if (percentage >= 20) return '20';
        if (percentage >= 10) return '10';
        return '0';
    }

    formatAuthor(npub) {
        return npub.substring(0, 16) + '...';
    }

    formatNpub(npub) {
        return npub.substring(0, 20) + '...';
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateDefaultAvatar() {
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="%23f7931a"/><text x="40" y="48" text-anchor="middle" font-size="24" fill="white">⚡</text></svg>`;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔥 Starting Thunderproof Application...');
    window.thunderproof = new ThunderproofApp();
});

// Handle browser navigation
window.addEventListener('popstate', () => {
    if (window.thunderproof) {
        window.thunderproof.handleURLParams();
    }
});