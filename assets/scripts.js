document.addEventListener('DOMContentLoaded', function() {
    const themeIcon = document.getElementById('theme-icon');
    const themeToggle = document.getElementById('theme-toggle');

    function addThemeCSS(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        removeThemeCSS();
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function removeThemeCSS() {
        const lightCSS = document.querySelector('link[href="/module/github-markdown/github-markdown-light.css"]');
        if (lightCSS) lightCSS.remove();

        const darkCSS = document.querySelector('link[href="/module/github-markdown/github-markdown-dark.css"]');
        if (darkCSS) darkCSS.remove();
    }

    function applyTheme(theme) {
        const body = document.body;
        const main = document.querySelector('main');

        if (theme === 'dark-theme') {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            addThemeCSS('/module/github-markdown/github-markdown-dark.css');

            body.style.background = '#0d1117';

            if (main) {
                main.style.background = '#0d1117';
                main.style.border = '1px solid #30363d';
            }

            themeIcon.textContent = '🌕';
            themeToggle.checked = true;
            localStorage.setItem('theme', 'dark-theme');
        } else {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            addThemeCSS('/module/github-markdown/github-markdown-light.css');

            body.style.background = '#ffffff';

            if (main) {
                main.style.background = '#ffffff';
                main.style.border = '1px solid #d0d7de';
            }

            themeIcon.textContent = '🌑';
            themeToggle.checked = false;
            localStorage.setItem('theme', 'light-theme');
        }
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme('dark-theme');
    }

    themeToggle.addEventListener('change', function() {
        if (this.checked) {
            applyTheme('dark-theme');
        } else {
            applyTheme('light-theme');
        }
    });
});
