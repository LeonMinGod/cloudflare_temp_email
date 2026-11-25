<script setup>
import { ref, h, computed, onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import {
    DarkModeFilled, LightModeFilled, MenuFilled,
    AdminPanelSettingsFilled, MonitorHeartFilled,
    KeyboardArrowDownOutlined, OpenInNewOutlined
} from '@vicons/material'
import { Envelope, GithubAlt, Language, User } from '@vicons/fa'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import { DEFAULT_LOCALE, isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../i18n/locale-registry'
import Turnstile from '../components/Turnstile.vue'
import { NButton, NIcon } from 'naive-ui'

const message = useMessage()
const notification = useNotification()

const {
    toggleDark, isDark, isTelegram, showAdminPage,
    showAuth, auth, loading, openSettings, preferredLocale, userSettings
} = useGlobalState()
const route = useRoute()
const router = useRouter()
const isCompactHeader = useMediaQuery('(max-width: 1100px)')

const showMobileMenu = ref(false)
const menuValue = computed(() => {
    if (route.path.includes("user")) return "user";
    if (route.path.includes("admin")) return "admin";
    return "home";
});

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(auth.value),
                cf_token: cfToken.value
            })
        });
        location.reload()
    } catch (error) {
        message.error(error.message || "error");
        turnstileRef.value?.refresh?.();
    }
}

const languageOptions = SUPPORTED_LOCALES.map((locale) => ({
    label: getLocaleLabel(locale),
    value: locale,
    key: locale,
}))

const currentLocaleLabel = computed(() => {
    return languageOptions.find(opt => opt.value === locale.value)?.label || locale.value;
});

const { t, locale } = useScopedI18n('views.Header')

const changeLocale = async (lang) => {
    if (!isSupportedLocale(lang)) {
        return;
    }

    const currentFullPath = route.fullPath;
    const targetFullPath = replaceLocaleInFullPath(currentFullPath, lang);

    if (lang === locale.value && targetFullPath === currentFullPath) {
        showMobileMenu.value = false;
        return;
    }

    if (lang === DEFAULT_LOCALE) {
        preferredLocale.value = DEFAULT_LOCALE;
    }

    let localeSwitched = false;
    try {
        await router.push({ path: targetFullPath, force: true });
        localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        if (!localeSwitched) {
            await router.replace({ path: targetFullPath, force: true });
            localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        }
    } catch (error) {
        console.error('Failed to switch locale', error);
    } finally {
        showMobileMenu.value = false;
    }

    if (localeSwitched) preferredLocale.value = lang;
}

const version = import.meta.env.PACKAGE_VERSION ? `v${import.meta.env.PACKAGE_VERSION}` : "";
const showGithubForCurrentUser = computed(() => {
    if (!openSettings.value.showGithub) return false;
    if (openSettings.value.showGithubForUser) return true;
    return showAdminPage.value;
});

const menuOptions = computed(() => [
    {
        label: () => h(NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "home" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    await router.push(getRouterPathWithLang('/', locale.value));
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('mailbox'),
                icon: () => h(NIcon, { component: Envelope })
            }),
        key: "home"
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "user" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    await router.push(getRouterPathWithLang("/user", locale.value));
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('userCenter'),
                icon: () => h(NIcon, { component: User }),
            }
        ),
        key: "user",
        show: !isTelegram.value
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "admin" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    loading.value = true;
                    await router.push(getRouterPathWithLang('/admin', locale.value));
                    loading.value = false;
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('admin'),
                icon: () => h(NIcon, { component: AdminPanelSettingsFilled }),
            }
        ),
        show: showAdminPage.value,
        key: "admin"
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                style: "width: 100%",
                onClick: () => { toggleDark(); showMobileMenu.value = false; }
            },
            {
                default: () => isDark.value ? t('light') : t('dark'),
                icon: () => h(
                    NIcon, { component: isDark.value ? LightModeFilled : DarkModeFilled }
                )
            }
        ),
        key: "theme"
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                style: "width: 100%",
                tag: "a",
                target: "_blank",
                href: openSettings.value?.statusUrl,
            },
            {
                default: () => t('status'),
                icon: () => h(NIcon, { component: MonitorHeartFilled })
            }
        ),
        show: !!openSettings.value?.statusUrl,
        key: "status"
    }
]);

useHead({
    title: () => openSettings.value.title || 'LeonMinGod · 灵境云邮 | Immortal Mail',
    meta: [
        { name: "description", content: openSettings.value.description || 'LeonMinGod 灵境云邮 · 仙境临风，万简星驰。' },
    ]
});

const logoClickCount = ref(0);
const logoClick = async () => {
    if (route.path.includes("admin")) {
        logoClickCount.value = 0;
        return;
    }
    if (logoClickCount.value >= 4) {
        logoClickCount.value = 0;
        message.info("进入管理员页面");
        loading.value = true;
        await router.push(getRouterPathWithLang('/admin', locale.value));
        loading.value = false;
        return;
    }
    logoClickCount.value++;
    message.info("连续点击5次，进入管理员页面");
}

onMounted(async () => {
    await api.getOpenSettings(message, notification);
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
});
</script>

<template>
    <div>
        <n-page-header class="immortal-page-header">
            <template #title>
                <div class="brand-title-wrap">
                    <span class="brand-title-main">LeonMinGod</span>
                    <span class="brand-subtitle-badge">IMMORTAL MAIL</span>
                </div>
            </template>
            <template #avatar>
                <div class="brand-avatar-wrap" @click="logoClick" title="LeonMinGod">
                    <n-avatar round :size="34" class="brand-avatar" src="/logo.png" />
                </div>
            </template>
            <template #extra>
                <n-space align="center" class="header-extra">
                    <n-menu v-if="!isCompactHeader" mode="horizontal" :options="menuOptions" responsive />
                    <n-button v-else :text="true" @click="showMobileMenu = !showMobileMenu">
                        <template #icon>
                            <n-icon :component="MenuFilled" />
                        </template>
                        {{ t('menu') }}
                    </n-button>
                    <n-dropdown v-if="!isCompactHeader" :options="languageOptions" @select="changeLocale" trigger="click" class="header-locale-dropdown">
                        <n-button text size="small" class="header-locale-button" style="padding: 0 10px;">
                            <template #icon>
                                <n-icon :component="Language" />
                            </template>
                            {{ currentLocaleLabel }}
                            <n-icon :component="KeyboardArrowDownOutlined" style="margin-left: 4px;" />
                        </n-button>
                    </n-dropdown>
                    <n-button
                        v-if="!isCompactHeader && showGithubForCurrentUser"
                        text
                        size="small"
                        class="header-version-button"
                        tag="a"
                        target="_blank"
                        href="https://github.com/dreamhunter2333/cloudflare_temp_email"
                    >
                        <template #icon>
                            <n-icon :component="GithubAlt" />
                        </template>
                        {{ version || 'Github' }}
                    </n-button>
                </n-space>
            </template>
        </n-page-header>
        <n-drawer v-model:show="showMobileMenu" placement="top" style="height: 100vh;">
            <n-drawer-content :title="t('menu')" closable>
                <n-menu :options="menuOptions" />
                <div class="mobile-menu-actions">
                    <n-dropdown :options="languageOptions" @select="changeLocale" trigger="click" class="header-locale-dropdown">
                        <button type="button" class="mobile-menu-utility-button">
                            <n-icon :component="Language" />
                            <span class="mobile-menu-action-label">{{ currentLocaleLabel }}</span>
                            <n-icon :component="KeyboardArrowDownOutlined" class="mobile-menu-action-arrow" />
                        </button>
                    </n-dropdown>
                    <a
                        v-if="showGithubForCurrentUser"
                        class="mobile-menu-utility-button"
                        target="_blank"
                        rel="noopener noreferrer"
                        href="https://github.com/dreamhunter2333/cloudflare_temp_email"
                    >
                        <n-icon :component="GithubAlt" />
                        <span class="mobile-menu-action-label">{{ version || 'Github' }}</span>
                        <n-icon :component="OpenInNewOutlined" class="mobile-menu-action-arrow" />
                    </a>
                </div>
            </n-drawer-content>
        </n-drawer>
        <n-modal v-model:show="showAuth" :closable="false" :closeOnEsc="false" :maskClosable="false" preset="dialog"
            :title="t('accessHeader')">
            <p>{{ t('accessTip') }}</p>
            <n-input v-model:value="auth" type="password" show-password-on="click" @keyup.enter="authFunc" />
            <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
            <template #action>
                <n-button :loading="loading" @click="authFunc" type="primary">
                    {{ t('ok') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
:deep(.n-page-header) {
    align-items: center;
    flex-wrap: nowrap;
}

:deep(.n-page-header__main) {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

:deep(.n-page-header__title) {
    min-width: 0;
    overflow: hidden;
}

:deep(.n-page-header__title h3) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:deep(.n-page-header__extra) {
    flex: 0 0 auto;
}

.n-layout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.header-extra {
    align-items: center;
    flex-wrap: nowrap;
}

.header-extra :deep(.n-space-item) {
    display: flex;
    align-items: center;
}

.header-locale-button {
    display: inline-flex;
    align-items: center;
}

.header-locale-button :deep(.n-button__content) {
    display: inline-flex;
    align-items: center;
}

.header-locale-button :deep(.n-icon) {
    display: inline-flex;
    align-items: center;
}

.header-version-button {
    display: inline-flex;
    align-items: center;
}

.header-version-button :deep(.n-button__content) {
    display: inline-flex;
    align-items: center;
}

.mobile-menu-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(128, 128, 128, 0.16);
}

.mobile-menu-utility-button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    width: 100%;
    min-width: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: none;
    opacity: 0.82;
    cursor: pointer;
}

.mobile-menu-action-label {
    margin: 0 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-menu-action-arrow {
    flex: 0 0 auto;
    margin-left: 2px;
}

.n-alert {
    margin-top: 10px;
    margin-bottom: 10px;
    text-align: center;
}

.n-card {
    margin-top: 10px;
}

.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: 20px;
}

.n-form .n-button {
    margin-top: 10px;
}

.immortal-page-header {
    padding: 10px 18px;
    border-radius: 16px;
    background: var(--glass-card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-card-border);
    box-shadow: var(--glass-shadow);
    margin: 8px 0 14px 0;
}

.brand-avatar-wrap {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.brand-avatar-wrap:hover {
    transform: scale(1.05);
}

.brand-avatar {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    overflow: hidden;
}

.brand-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.brand-title-main {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    background: var(--brand-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    white-space: nowrap;
}

.brand-subtitle-badge {
    display: inline-flex;
    align-items: center;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    font-weight: 600;
    color: var(--brand-badge-color);
    background: var(--brand-badge-bg);
    border: 1px solid var(--brand-badge-border);
    border-radius: 9999px;
    padding: 2px 7px;
    box-shadow: 0 0 8px var(--ice-glow);
    white-space: nowrap;
}

@media (max-width: 640px) {
    .immortal-page-header {
        padding: 8px 12px;
        margin: 6px 0 10px 0;
    }

    .brand-title-main {
        font-size: 0.98rem;
        letter-spacing: 0.08em;
    }

    .brand-subtitle-badge {
        font-size: 0.52rem;
        padding: 1px 5px;
    }

    :deep(.n-page-header) {
        padding: 4px 6px;
    }

    :deep(.n-page-header__title) {
        min-width: 0;
    }
}

@media (max-width: 374px) {
    .brand-title-wrap {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
    }

    .brand-title-main {
        font-size: 0.9rem;
    }
}

</style>
