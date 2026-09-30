/* EFCS site updates: form validation, services scroller, active nav link. */
(function () {
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    // Phone: exactly 10 digits, digits only.
    var phones = document.querySelectorAll('input[type="tel" i], input[name="phone"], input[name="phonenumber"]');
    phones.forEach(function (el) {
      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('pattern', '[0-9]{10}');
      el.setAttribute('minlength', '10');
      el.setAttribute('maxlength', '10');
      el.setAttribute('title', 'Enter a 10-digit phone number');
      el.required = true;
      el.addEventListener('input', function () {
        var digits = el.value.replace(/\D/g, '').slice(0, 10);
        if (digits !== el.value) el.value = digits;
        el.setCustomValidity(digits.length === 10 || digits.length === 0 ? '' : 'Please enter a 10-digit phone number');
      });
      el.addEventListener('invalid', function () {
        if (el.value.length && el.value.length !== 10) el.setCustomValidity('Please enter a 10-digit phone number');
      });
    });

    // Date of visit: mandatory, not in the past.
    var d = new Date();
    var today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    document.querySelectorAll('input[type="date"]').forEach(function (el) {
      el.required = true;
      el.setAttribute('min', today);
    });

    // Services scroller on the home page.
    if (window.Swiper && document.querySelector('.efcs-services-swiper .swiper')) {
      new Swiper('.efcs-services-swiper .swiper', {
        loop: true,
        grabCursor: true,
        spaceBetween: 24,
        autoplay: { delay: 3500, pauseOnMouseEnter: true, disableOnInteraction: false },
        navigation: { nextEl: '.efcs-services-swiper .efcs-swiper-next', prevEl: '.efcs-services-swiper .efcs-swiper-prev' },
        pagination: { el: '.efcs-services-swiper .swiper-pagination', clickable: true },
        breakpoints: { 0: { slidesPerView: 1 }, 576: { slidesPerView: 2 }, 992: { slidesPerView: 3 }, 1300: { slidesPerView: 4 } }
      });
    }

    // Highlight the current page in the header nav.
    var page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.efcs-nav > li').forEach(function (li) {
      var pages = (li.getAttribute('data-pages') || '').split(' ');
      if (pages.indexOf(page) > -1) li.classList.add('active');
    });
  });
})();
