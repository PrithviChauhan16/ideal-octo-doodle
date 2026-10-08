import { supabase } from './supabaseClient.js';

/* PEPE KUN - Dynamic Storefront, Multi-Category Collections & Auth Script */

(function () {
  'use strict';

  // State Management
  let cart = JSON.parse(localStorage.getItem('pepe_cart') || '[]');
  let products = [];
  let primaryCategories = [];
  let collectionCategories = [];
  let currentUser = null;
  let selectedColor = null;

  // 1. Auth Session Check & Sync Cart
  async function checkUserSession() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      currentUser = user;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const displayName = profile?.full_name || user.email?.split('@')[0] || 'Account';

        const loginBtn = document.getElementById('auth-login-btn');
        if (loginBtn) {
          loginBtn.textContent = displayName;
          loginBtn.href = 'account.html';
        }

        const mobileLoginBtn = document.getElementById('mobile-auth-btn');
        if (mobileLoginBtn) {
          mobileLoginBtn.textContent = displayName;
          mobileLoginBtn.href = 'account.html';
        }

        await fetchUserCartFromSupabase();
      } else {
        updateCartUI();
      }
    } catch (err) {
      console.error('Error checking user session:', err);
      updateCartUI();
    }
  }

  // Fetch cart count & items from Supabase
  async function fetchUserCartFromSupabase() {
    if (!currentUser) return;

    try {
      const { data, error } = await supabase
        .from('cart')
        .select('*, products(*)')
        .eq('user_id', currentUser.id);

      if (error) throw error;

      if (data) {
        cart = data.map(item => ({
          ...item.products,
          quantity: item.quantity,
          cart_id: item.id,
          selected_color: item.selected_color || null
        }));
        updateCartUI();
      }
    } catch (err) {
      console.error('Error fetching Supabase cart:', err);
    }
  }

  // 2. Cart Functions
  function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    ['cart-count', 'cart-count-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    });
    localStorage.setItem('pepe_cart', JSON.stringify(cart));
  }

  function selectColor(color, btnElement) {
    selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.classList.remove('border-pink-500', 'bg-pink-50', 'text-pink-600', 'ring-2', 'ring-pink-400');
      btn.classList.add('border-gray-300', 'text-gray-700');
    });
    if (btnElement) {
      btnElement.classList.remove('border-gray-300', 'text-gray-700');
      btnElement.classList.add('border-pink-500', 'bg-pink-50', 'text-pink-600', 'ring-2', 'ring-pink-400');
    }
  }

  async function addToCart(productId, sourceBtnId = null, chosenColor = null) {
    const product = products.find(p => String(p.id) === String(productId));
    if (!product && !currentUser) return;

    let availableColors = [];
    try {
      availableColors = Array.isArray(product?.colors) ? product.colors : JSON.parse(product?.colors || '[]');
    } catch (e) {
      if (typeof product?.colors === 'string') {
        availableColors = product.colors.split(',').map(c => c.trim()).filter(Boolean);
      }
    }

    if (availableColors.length > 0 && !chosenColor) {
      openProductModal(productId);
      alert('Please select a color option before adding to cart.');
      return;
    }

    const targetBtnId = sourceBtnId || `btn-${productId}`;
    const btn = document.getElementById(targetBtnId);
    let originalText = '';
    if (btn) {
      originalText = btn.textContent;
      btn.textContent = 'Adding...';
      btn.disabled = true;
    }

    try {
      if (currentUser) {
        let query = supabase
          .from('cart')
          .select('id, quantity')
          .eq('user_id', currentUser.id)
          .eq('product_id', productId);

        if (chosenColor) {
          query = query.eq('selected_color', chosenColor);
        } else {
          query = query.is('selected_color', null);
        }

        const { data: existingItem, error: fetchErr } = await query.maybeSingle();

        if (fetchErr) throw fetchErr;

        if (existingItem) {
          const newQty = (Number(existingItem.quantity) || 1) + 1;
          const { error: updateErr } = await supabase
            .from('cart')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', existingItem.id);

          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('cart')
            .insert([{
              user_id: currentUser.id,
              product_id: productId,
              quantity: 1,
              selected_color: chosenColor || null
            }]);

          if (insertErr) throw insertErr;
        }

        await fetchUserCartFromSupabase();
      } else {
        const existingIndex = cart.findIndex(p => 
          String(p.id) === String(productId) && p.selected_color === (chosenColor || null)
        );
        if (existingIndex > -1) {
          cart[existingIndex].quantity = (Number(cart[existingIndex].quantity) || 1) + 1;
        } else if (product) {
          cart.push({ ...product, quantity: 1, selected_color: chosenColor || null });
        }
        updateCartUI();
      }

      if (btn) {
        btn.textContent = 'Added ✓';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1200);
      }
    } catch (err) {
      console.error('Error adding item to cart:', err);
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }

  // 3. Category Fetching
  async function loadCategoriesAndCollections() {
    try {
      const { data: categoriesData, error: catError } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: true });

      if (catError) throw catError;

      const allCats = categoriesData || [];
      collectionCategories = allCats.filter(c => c.section === 'sub' || c.type === 'collection');
      primaryCategories = allCats.filter(c => !collectionCategories.includes(c));

      renderCategoryRow('category-grid', primaryCategories, 'No categories found.');
      renderCategoryRow('collection-grid', collectionCategories, 'New collections coming soon.');
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function renderCategoryRow(containerId, list, emptyMessage) {
    const row = document.getElementById(containerId);
    if (!row) return;

    if (list.length === 0) {
      row.innerHTML = `<p class="text-gray-500 w-full text-center py-6">${emptyMessage}</p>`;
      updateRowArrows(row);
      return;
    }

    row.innerHTML = list.map(cat => {
      const safeName = String(cat.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const img = cat.image_url
        ? `<img src="${cat.image_url}" alt="${cat.name}" draggable="false" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`
        : `<div class="w-full h-full flex items-center justify-center text-3xl">🧸</div>`;
      return `
      <div onclick="showCategoryProducts('${cat.id}', '${safeName}')"
           class="flex-none w-40 md:w-52 snap-start group cursor-pointer bg-white rounded-3xl p-4 shadow-sm border border-white/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center select-none">
        <div class="w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-3 border border-gray-100">
          ${img}
        </div>
        <h3 class="text-base md:text-lg font-semibold text-gray-900 group-hover:text-pink-500 transition-colors truncate">${cat.name}</h3>
      </div>`;
    }).join('');

    row.scrollLeft = 0;
    if (!row.dataset.bound) {
      row.dataset.bound = '1';
      row.addEventListener('scroll', () => updateRowArrows(row), { passive: true });
      window.addEventListener('resize', () => updateRowArrows(row));
    }
    updateRowArrows(row);
  }

  function updateRowArrows(row) {
    const wrap = row.parentElement;
    if (!wrap) return;
    const left = wrap.querySelector('[data-arrow="left"]');
    const right = wrap.querySelector('[data-arrow="right"]');
    const max = row.scrollWidth - row.clientWidth - 2;
    if (left) left.classList.toggle('md:flex', row.scrollLeft > 2);
    if (right) right.classList.toggle('md:flex', row.scrollLeft < max);
  }

  function scrollCategoryRow(containerId, direction) {
    const row = document.getElementById(containerId);
    if (!row) return;
    row.scrollBy({ left: direction * Math.max(row.clientWidth * 0.8, 220), behavior: 'smooth' });
  }

  // 4. Primary Category Drilldown View
  async function showCategoryProducts(categoryId, categoryName) {
    const categoriesSection = document.getElementById('categories');
    const collectionsSection = document.getElementById('collections-section');
    const productSection = document.getElementById('product-display');
    const productGrid = document.getElementById('product-grid');
    const categoryTitle = document.getElementById('current-category-title');

    if (categoryTitle) categoryTitle.textContent = categoryName;

    let categoryProds = [];
    try {
      const { data: junctionData } = await supabase
        .from('product_categories')
        .select('products(*)')
        .eq('category_id', categoryId);

      if (junctionData && junctionData.length > 0) {
        categoryProds = junctionData.map(j => j.products).filter(Boolean);
      } else {
        const { data } = await supabase
          .from('products')
          .select('*')
          .or(`category_id.eq.${categoryId},category_ids.cs.{"${categoryId}"}`);
        categoryProds = data || [];
      }
    } catch (e) {
      console.error('Error fetching category products:', e);
    }

    categoryProds.forEach(p => {
      if (!products.some(existing => existing.id === p.id)) {
        products.push(p);
      }
    });

    if (productGrid) {
      if (categoryProds.length === 0) {
        productGrid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-8">No products found in this category.</p>`;
      } else {
        productGrid.innerHTML = categoryProds.map(prod => {
          let imagesArr = [];
          try {
             imagesArr = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
          } catch(e) {
             imagesArr = [prod.images || 'https://via.placeholder.com/300'];
          }

          return `
            <div class="product-card bg-white rounded-[2rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col relative group overflow-hidden">
                <div class="relative w-full aspect-[4/5] bg-white overflow-hidden group/slider rounded-t-[2rem]">
                    <div id="slider-${prod.id}" class="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory h-full w-full no-scrollbar relative z-10 touch-pan-x" onscroll="updateSliderDots(event, '${prod.id}')">
                        ${imagesArr.map((img) => `
                            <div class="w-full h-full flex-none snap-center flex items-center justify-center p-4">
                                <img src="${img}" alt="${prod.title}" onclick="openProductModal('${prod.id}')" class="w-full h-full object-contain cursor-pointer transition-transform duration-500 group-hover/slider:scale-105">
                            </div>
                        `).join('')}
                    </div>
                    
                    ${imagesArr.length > 1 ? `
                        <button onclick="scrollProductSlider(event, '${prod.id}', -1)" class="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 backdrop-blur hover:bg-gray-50 text-gray-900 w-8 h-8 rounded-full items-center justify-center opacity-0 group-hover/slider:opacity-100 transition-all shadow-md z-30 pb-1 text-xl leading-none cursor-pointer">‹</button>
                        <button onclick="scrollProductSlider(event, '${prod.id}', 1)" class="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border border-gray-200 backdrop-blur hover:bg-gray-50 text-gray-900 w-8 h-8 rounded-full items-center justify-center opacity-0 group-hover/slider:opacity-100 transition-all shadow-md z-30 pb-1 text-xl leading-none cursor-pointer">›</button>
                        
                        <div class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/10 to-transparent pointer-events-none rounded-b-2xl z-20"></div>
                        <div class="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none z-30" id="dots-${prod.id}">
                            ${imagesArr.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === 0 ? 'bg-white scale-125' : 'bg-white/60'} shadow-sm border border-gray-300/30"></span>`).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="p-5 flex flex-col flex-grow border-t border-gray-50 relative z-20 bg-white">
                    <div class="flex justify-between items-start mb-1 gap-2">
                        <h3 onclick="openProductModal('${prod.id}')" class="font-semibold text-gray-900 cursor-pointer hover:text-pink-500 transition-colors text-base md:text-lg line-clamp-2 leading-tight flex-grow">
                            ${prod.title}
                        </h3>
                        <p class="text-pink-500 font-bold text-base md:text-lg whitespace-nowrap mt-0.5">₹${parseFloat(prod.price).toFixed(2)}</p>
                    </div>
                    
                    <p class="text-gray-400 text-xs md:text-sm mb-5 mt-1 line-clamp-1">${prod.category || 'Premium Plushie'}</p>
                    
                    <button id="btn-${prod.id}" onclick="addToCart('${prod.id}', 'btn-${prod.id}')" class="mt-auto w-full bg-brand-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-pink-500 active:scale-95 transition-all shadow-md flex justify-center items-center gap-2 group/btn">
                        <svg class="w-4 h-4 group-hover/btn:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                        Add to Cart
                    </button>
                </div>
            </div>
          `;
        }).join('');
      }
    }

    if (categoriesSection && productSection) {
      categoriesSection.classList.add('hidden');
      if (collectionsSection) collectionsSection.classList.add('hidden');
      productSection.classList.remove('hidden');
      setTimeout(() => {
        productSection.classList.remove('opacity-0');
      }, 10);
    }
  }

  function hideProducts() {
    const section = document.getElementById('product-display');
    const collectionsSection = document.getElementById('collections-section');
    if (!section) return;

    section.classList.add('opacity-0');

    setTimeout(() => {
      section.classList.add('hidden');
      document.getElementById('categories')?.classList.remove('hidden');
      if (collectionsSection) collectionsSection.classList.remove('hidden');
      document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }

  // 5. Quick-View Modal Functions
  function openProductModal(productId) {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;

    selectedColor = null;

    const modal = document.getElementById('product-modal');
    const title = document.getElementById('modal-title');
    const price = document.getElementById('modal-price');
    const desc = document.getElementById('tab-desc');
    const specsList = document.getElementById('modal-specs-list');
    const thumbsContainer = document.getElementById('modal-thumbnails');
    const addCartBtn = document.getElementById('modal-add-cart-btn');
    const colorsContainer = document.getElementById('modal-colors-container');
    const colorsOptions = document.getElementById('modal-color-options');

    let images = [];
    try {
        images = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
    } catch(e) {
        images = [prod.images || 'https://via.placeholder.com/300'];
    }

    const specs = Array.isArray(prod.specifications) ? prod.specifications : JSON.parse(prod.specifications || '[]');

    let colors = [];
    try {
      colors = Array.isArray(prod.colors) ? prod.colors : JSON.parse(prod.colors || '[]');
    } catch (e) {
      if (typeof prod.colors === 'string') {
        colors = prod.colors.split(',').map(c => c.trim()).filter(Boolean);
      }
    }

    if (colorsContainer && colorsOptions) {
      if (colors.length > 0) {
        colorsContainer.classList.remove('hidden');
        colorsOptions.innerHTML = colors.map(color => `
          <button type="button" 
                  onclick="selectColor('${color}', this)"
                  class="color-btn border border-gray-300 rounded-full px-4 py-1.5 text-xs font-medium text-gray-700 hover:border-pink-500 transition-all">
            ${color}
          </button>
        `).join('');
      } else {
        colorsContainer.classList.add('hidden');
        colorsOptions.innerHTML = '';
      }
    }

const modalSwipeTrack = document.getElementById('modal-swipe-track');
    if (modalSwipeTrack) {
      const escapedImages = JSON.stringify(images).replace(/"/g, '&quot;');
      modalSwipeTrack.innerHTML = images.map((img, index) => `
          <div class="w-full h-full flex-none snap-center flex items-center justify-center p-4">
              <img src="${img}" onclick="openFullscreenGallery(${escapedImages}, ${index})" class="w-full h-full object-contain cursor-zoom-in active:opacity-75 transition-opacity" title="Tap to expand">
          </div>
      `).join('');
      modalSwipeTrack.scrollLeft = 0; 
    }

    if (title) title.textContent = prod.title;
    if (price) price.textContent = `₹${parseFloat(prod.price).toFixed(2)}`;
    if (desc) desc.textContent = prod.description || 'No description available.';

    if (specsList) {
      specsList.innerHTML = specs.length > 0
        ? specs.map(s => `<li>${s}</li>`).join('')
        : '<li>No specifications listed.</li>';
    }

    if (thumbsContainer) {
      thumbsContainer.innerHTML = images.map((img, index) => `
        <div onclick="changeModalImage(${index})" class="aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-pink-500 cursor-pointer bg-white transition-all p-1">
            <img src="${img}" class="w-full h-full object-contain">
        </div>
      `).join('');
    }

    if (addCartBtn) {
      addCartBtn.onclick = () => addToCart(prod.id, 'modal-add-cart-btn', selectedColor);
    }

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.body.style.overflow = 'auto';
    }, 300);
  }

  // 6. Contact Form Inquiry Submission
  async function handleContactSubmit(event) {
    event.preventDefault();

    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const messageInput = document.getElementById('contact-message');
    const submitBtn = document.getElementById('contact-submit-btn');

    if (!nameInput || !emailInput || !messageInput) return;

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !email || !message) {
      alert('Please fill in all fields.');
      return;
    }

    const originalBtnText = submitBtn ? submitBtn.textContent : 'Send Message';
    if (submitBtn) {
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
    }

    try {
      const { error } = await supabase
        .from('inquiries')
        .insert([{ name, email, message }]);

      if (error) throw error;

      alert('Thank you! Your message has been sent successfully.');
      document.getElementById('contact-form')?.reset();
    } catch (err) {
      console.error('Error submitting inquiry:', err);
      alert('Failed to send message. Please try again later.');
    } finally {
      if (submitBtn) {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    }
  }

  // 7. Swiping UI Helpers
  function updateSliderDots(event, productId) {
    const container = event.target;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    const activeIndex = Math.round(scrollLeft / width);

    const dotsContainer = document.getElementById(`dots-${productId}`);
    if (!dotsContainer) return;

    const dots = dotsContainer.children;
    for (let i = 0; i < dots.length; i++) {
        if (i === activeIndex) {
            dots[i].className = "w-1.5 h-1.5 rounded-full transition-all duration-300 bg-white scale-125 shadow-sm border border-gray-300/30";
        } else {
            dots[i].className = "w-1.5 h-1.5 rounded-full transition-all duration-300 bg-white/60 shadow-sm border border-gray-300/30";
        }
    }
  }

  function scrollProductSlider(event, productId, direction) {
    event.stopPropagation();
    const slider = document.getElementById(`slider-${productId}`);
    if (slider) {
        const scrollAmount = slider.clientWidth;
        slider.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
  }

  function scrollModalSlider(direction) {
    const track = document.getElementById('modal-swipe-track');
    if (track) {
        const width = track.clientWidth;
        track.scrollBy({ left: direction * width, behavior: 'smooth' });
    }
  }

  function changeModalImage(index) {
    const track = document.getElementById('modal-swipe-track');
    if (track) {
        const width = track.clientWidth;
        track.scrollTo({ left: index * width, behavior: 'smooth' });
    }
  }

  // 8. Fullscreen Gallery Logic
  function openFullscreenGallery(images, startIndex) {
    const gallery = document.getElementById('fullscreen-gallery');
    const track = document.getElementById('gallery-swipe-track');
    if (!gallery || !track) return;

    track.innerHTML = images.map((img) => `
        <div class="w-full h-full flex-none snap-center flex items-center justify-center p-4 md:p-12">
            <img src="${img}" class="max-w-full max-h-full object-contain select-none">
        </div>
    `).join('');

    gallery.classList.remove('hidden');
    gallery.classList.add('flex');
    
    setTimeout(() => {
        gallery.classList.remove('opacity-0');
        
        const width = track.clientWidth;
        track.scrollTo({ left: startIndex * width, behavior: 'instant' });
        updateGalleryCounter(startIndex, images.length);
    }, 10);

    track.onscroll = () => {
        const activeIndex = Math.round(track.scrollLeft / track.clientWidth);
        updateGalleryCounter(activeIndex, images.length);
    };
  }

  function updateGalleryCounter(index, total) {
      const counter = document.getElementById('gallery-counter');
      if (counter) counter.innerText = `${index + 1} / ${total}`;
  }

  function closeFullscreenGallery() {
      const gallery = document.getElementById('fullscreen-gallery');
      if (!gallery) return;
      gallery.classList.add('opacity-0');
      setTimeout(() => {
          gallery.classList.add('hidden');
          gallery.classList.remove('flex');
      }, 300);
  }

  function scrollGallerySlider(direction) {
      const track = document.getElementById('gallery-swipe-track');
      if (track) {
          const width = track.clientWidth;
          track.scrollBy({ left: direction * width, behavior: 'smooth' });
      }
  }

  // 9. Expose global handlers needed for inline onclick attributes in HTML
  window.showCategoryProducts = showCategoryProducts;
  window.hideProducts = hideProducts;
  window.scrollCategoryRow = scrollCategoryRow;
  window.openProductModal = openProductModal;
  window.closeModal = closeModal;
  window.addToCart = addToCart;
  window.selectColor = selectColor;
  window.updateSliderDots = updateSliderDots;
  window.scrollProductSlider = scrollProductSlider;
  window.scrollModalSlider = scrollModalSlider;
  window.changeModalImage = changeModalImage;
  window.openFullscreenGallery = openFullscreenGallery;
  window.closeFullscreenGallery = closeFullscreenGallery;
  window.scrollGallerySlider = scrollGallerySlider;

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', () => {
    checkUserSession();
    loadCategoriesAndCollections();

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', handleContactSubmit);
    }
  });
})();
