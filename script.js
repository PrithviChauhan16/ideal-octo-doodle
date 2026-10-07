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

  // Color selection helper
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

    // Validate if product requires color selection
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
          const imagesArr = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
          const mainImg = imagesArr[0] || 'https://via.placeholder.com/300';

          return `
            <div class="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
              <div class="cursor-pointer" onclick="openProductModal('${prod.id}')">
                <div class="w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-3 border border-gray-100">
                  <img src="${mainImg}" alt="${prod.title}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300">
                </div>
                <h4 class="font-semibold text-gray-900 text-base mb-1 line-clamp-1">${prod.title}</h4>
                <p class="text-pink-500 font-bold text-lg mb-3">₹${parseFloat(prod.price).toFixed(2)}</p>
              </div>
              <button id="btn-${prod.id}" onclick="addToCart('${prod.id}', 'btn-${prod.id}')" 
                      class="w-full bg-brand-900 text-white text-xs font-medium py-2.5 rounded-full hover:bg-pink-500 transition-colors">
                Add to Cart
              </button>
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

    selectedColor = null; // Reset chosen color

    const modal = document.getElementById('product-modal');
    const mainImg = document.getElementById('modal-main-img');
    const title = document.getElementById('modal-title');
    const price = document.getElementById('modal-price');
    const desc = document.getElementById('tab-desc');
    const specsList = document.getElementById('modal-specs-list');
    const thumbsContainer = document.getElementById('modal-thumbnails');
    const addCartBtn = document.getElementById('modal-add-cart-btn');

    const colorsContainer = document.getElementById('modal-colors-container');
    const colorsOptions = document.getElementById('modal-color-options');

    const images = Array.isArray(prod.images) ? prod.images : JSON.parse(prod.images || '[]');
    const specs = Array.isArray(prod.specifications) ? prod.specifications : JSON.parse(prod.specifications || '[]');

    // Parse colors
    let colors = [];
    try {
      colors = Array.isArray(prod.colors) ? prod.colors : JSON.parse(prod.colors || '[]');
    } catch (e) {
      if (typeof prod.colors === 'string') {
        colors = prod.colors.split(',').map(c => c.trim()).filter(Boolean);
      }
    }

    // Render Color Options
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

    if (mainImg) mainImg.src = images[0] || '';
    if (title) title.textContent = prod.title;
    if (price) price.textContent = `₹${parseFloat(prod.price).toFixed(2)}`;
    if (desc) desc.textContent = prod.description || 'No description available.';

    if (specsList) {
      specsList.innerHTML = specs.length > 0
        ? specs.map(s => `<li>${s}</li>`).join('')
        : '<li>No specifications listed.</li>';
    }

    if (thumbsContainer) {
      thumbsContainer.innerHTML = images.map(img => `
        <img src="${img}" onclick="document.getElementById('modal-main-img').src='${img}'" 
             class="w-full aspect-square object-cover rounded-xl border border-gray-200 cursor-pointer hover:border-pink-500 transition-all">
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

  // Expose global handlers needed for inline onclick attributes in HTML
  window.showCategoryProducts = showCategoryProducts;
  window.hideProducts = hideProducts;
  window.scrollCategoryRow = scrollCategoryRow;
  window.openProductModal = openProductModal;
  window.closeModal = closeModal;
  window.addToCart = addToCart;
  window.selectColor = selectColor;

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