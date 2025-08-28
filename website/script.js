// Simple smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scrolling to all links with hash
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const offsetTop = targetElement.offsetTop - 80; // Account for fixed header if any
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Add animation when elements come into view
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe elements that should animate in
    const animateElements = document.querySelectorAll('.feature-card, .step, .download-card, .use-case, .product-card, .streaming-card, .opensource-card, .intro-card, .setup-step, .video-card');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add hover effect for download buttons
    const downloadButtons = document.querySelectorAll('.download-card .btn');
    downloadButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });

    // Simple click tracking for demo purposes
    const ctaButtons = document.querySelectorAll('.btn-primary');
    ctaButtons.forEach(button => {
        button.addEventListener('click', function() {
            console.log('CTA clicked:', this.textContent);
            // Could add analytics tracking here
        });
    });

    // --- Direct OS-specific download button for ChallaChat ---
    (function setupDirectDownloadButton() {
        const downloadLink = document.querySelector('#products .download-link');
        if (!downloadLink) return;

        const os = detectOS();
        const label = os === 'Windows' ? 'Windows' : os === 'macOS' ? 'macOS' : os === 'Linux' ? 'Linux' : null;

        // Update button label and icon immediately; we'll swap href after fetching
        const iconSvg = getOsIconSvg(label);
        const text = label ? `Download for ${label}` : 'Download latest release';
        downloadLink.innerHTML = `${iconSvg ? iconSvg : ''}<span>${text}</span>`;

        // Find the best asset from GitHub releases for this OS
        const apiUrl = 'https://api.github.com/repos/challacade/challachat/releases/latest';
        fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load releases')))
            .then(json => {
                const asset = pickAssetForOS(json?.assets || [], label);
                if (asset && asset.browser_download_url) {
                    downloadLink.href = asset.browser_download_url;
                    // For direct file download, open in same tab to allow browser download UX
                    downloadLink.removeAttribute('target');
                } else {
                    // Fallback to latest release page
                    downloadLink.href = 'https://github.com/challacade/challachat/releases/latest';
                    downloadLink.target = '_blank';
                }
            })
            .catch(() => {
                downloadLink.href = 'https://github.com/challacade/challachat/releases/latest';
                downloadLink.target = '_blank';
            });

        function detectOS() {
            const ua = navigator.userAgent || navigator.platform || '';
            const p = navigator.platform || '';
            if (/Win/i.test(ua) || /Win/i.test(p)) return 'Windows';
            if (/Mac/i.test(ua) || /Mac/i.test(p)) return 'macOS';
            if (/Linux|X11/i.test(ua) || /Linux/i.test(p)) return 'Linux';
            return 'Unknown';
        }

        function getOsIconSvg(label) {
                        if (label === 'Windows') {
                                // Clean rounded four-pane Windows logo
                                return `
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                                    <rect x="2" y="2" width="9" height="9" rx="1.2" ry="1.2"/>
                                    <rect x="13" y="2" width="9" height="9" rx="1.2" ry="1.2"/>
                                    <rect x="2" y="13" width="9" height="9" rx="1.2" ry="1.2"/>
                                    <rect x="13" y="13" width="9" height="9" rx="1.2" ry="1.2"/>
                                </svg>`;
                        }
            if (label === 'macOS') {
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 1.9c0 1-.4 2-.9 2.6-.6.7-1.7 1.3-2.6 1.2-.1-1 .5-2 .9-2.5.6-.7 1.7-1.3 2.6-1.3zM20.8 17.8c-.5 1.2-1.2 2.3-2.1 3.4-1 .1-1.8.3-2.3.3-.6 0-1.3-.2-2.2-.6-.9-.4-1.8-.6-2.7-.6-.9 0-1.9.2-2.9.6-.8.4-1.5.6-2.1.6-.8 0-1.6-.2-2.4-.5-.8-1.1-1.5-2.3-2-3.6-.7-1.8-1.1-3.5-1.1-5 0-1.9.6-3.5 1.7-4.8C2.9 6.5 3.9 6 5 6c.6 0 1.4.2 2.3.6.9.4 1.7.6 2.4.6.6 0 1.4-.2 2.3-.6.9-.4 1.6-.6 2.2-.6 1.4 0 2.6.6 3.6 1.7-.9.6-1.6 1.4-2.1 2.4-.5 1-.7 2-.6 3 .1 1.1.5 2.1 1.2 3 .5.7 1.2 1.3 2.1 1.7z"/></svg>`;
            }
            // Linux: no icon per request
            return '';
        }

        function pickAssetForOS(assets, label) {
            if (!Array.isArray(assets) || !label) return null;
            const name = a => (a && (a.name || a.label || '')) + '';
            
            // Define patterns for each OS - more specific for your release naming
            const patterns = {
                Windows: /challachat-setup\.exe$|challachat-win-portable\.zip$/i,
                macOS: /(mac|osx|darwin).*(dmg|zip)|\.dmg$|mac.*\.zip$/i,
                Linux: /(linux).*(AppImage|deb|rpm|tar|gz)|\.(AppImage|deb|rpm|tar\.gz)$/i
            };
            
            const rx = patterns[label];
            if (!rx) return null;
            
            // For Windows, prefer the installer over portable
            if (label === 'Windows') {
                const installer = assets.find(a => /challachat-setup\.exe$/i.test(name(a)));
                const portable = assets.find(a => /challachat-win-portable\.zip$/i.test(name(a)));
                return installer || portable;
            }
            
            // For other platforms, find the first matching asset
            return assets.find(a => rx.test(name(a))) || null;
        }
    })();
});
