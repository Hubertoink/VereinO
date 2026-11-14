// VereinO installer presentation only. MIT License, see ../../LICENSE.
// No changes to installation, elevation, update, or uninstall behavior.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <uxtheme.h>
#include <dwmapi.h>
#include <richedit.h>
#include <shellapi.h>
#include <new>

namespace {
constexpr UINT_PTR subclassId = 0x564F;
constexpr UINT refreshMessage = WM_APP + 0x36A;
constexpr COLORREF darkBackground = RGB(25, 29, 28);
constexpr COLORREF darkText = RGB(240, 243, 241);
constexpr COLORREF accent = RGB(80, 171, 240);
enum class Mode { Light, Dark, Contrast };
HWND mainWindow = nullptr;
HMODULE module = nullptr;
HHOOK hook = nullptr;
Mode mode = Mode::Light;
HBRUSH backgroundBrush = nullptr;
bool refreshing = false;

Mode ChooseMode(bool hasPreference, DWORD appsUseLightTheme, bool contrast) {
    if (contrast) return Mode::Contrast;
    return hasPreference && appsUseLightTheme == 0 ? Mode::Dark : Mode::Light;
}

Mode ReadMode() {
    HIGHCONTRASTW contrast{sizeof(contrast)};
    SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(contrast), &contrast, 0);
    DWORD light = 1, size = sizeof(light);
    const auto result = RegGetValueW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &light, &size);
    return ChooseMode(result == ERROR_SUCCESS, light, (contrast.dwFlags & HCF_HIGHCONTRASTON) != 0);
}

bool IsClass(HWND window, const wchar_t* name) {
    wchar_t actual[64]{};
    GetClassNameW(window, actual, 64);
    return lstrcmpiW(actual, name) == 0;
}

COLORREF Background() {
    if (mode == Mode::Dark) return darkBackground;
    return mode == Mode::Contrast ? GetSysColor(COLOR_WINDOW) : RGB(255, 255, 255);
}

COLORREF Text() {
    return mode == Mode::Dark ? darkText : GetSysColor(COLOR_WINDOWTEXT);
}

struct ControlState {
    bool shield = false;
    bool capturedHeader = false;
    HBITMAP originalHeader = nullptr;
    HBITMAP themedHeader = nullptr;
};

LRESULT CALLBACK Subclass(HWND, UINT, WPARAM, LPARAM, UINT_PTR, DWORD_PTR);

void StyleControl(HWND window, ControlState* state) {
    // Keep native light/high-contrast controls. No undocumented uxtheme ordinals.
    if (IsClass(window, L"Edit") || IsClass(window, L"RichEdit20W") ||
        IsClass(window, L"RICHEDIT50W") || IsClass(window, WC_LISTVIEWW)) {
        SetWindowTheme(window, mode == Mode::Dark ? L"DarkMode_Explorer" : nullptr, nullptr);
    }
    if (IsClass(window, L"RichEdit20W") || IsClass(window, L"RICHEDIT50W")) {
        SendMessageW(window, EM_SETBKGNDCOLOR, 0, Background());
        // SCF_ALL preserves selection and scroll position while recoloring the license.
        CHARFORMAT2W format{};
        format.cbSize = sizeof(format);
        format.dwMask = CFM_COLOR;
        format.crTextColor = Text();
        SendMessageW(window, EM_SETCHARFORMAT, SCF_ALL, reinterpret_cast<LPARAM>(&format));
    }
    if (IsClass(window, WC_LISTVIEWW)) {
        ListView_SetBkColor(window, Background());
        ListView_SetTextBkColor(window, Background());
        ListView_SetTextColor(window, Text());
    }
    if (IsClass(window, PROGRESS_CLASSW)) {
        SetWindowTheme(window, mode == Mode::Dark ? L"" : nullptr, mode == Mode::Dark ? L"" : nullptr);
        SendMessageW(window, PBM_SETBKCOLOR, 0, mode == Mode::Dark ? RGB(48, 55, 53) : CLR_DEFAULT);
        SendMessageW(window, PBM_SETBARCOLOR, 0, mode == Mode::Dark ? accent : CLR_DEFAULT);
    }
    // MUI's small header is a white bitmap, so swap it as well as the controls.
    if (GetParent(window) == mainWindow && GetDlgCtrlID(window) == 1046) {
        BITMAP dimensions{};
        auto current = reinterpret_cast<HBITMAP>(SendMessageW(window, STM_GETIMAGE, IMAGE_BITMAP, 0));
        if (current) GetObjectW(current, sizeof(dimensions), &dimensions);
        HBITMAP replacement = static_cast<HBITMAP>(LoadImageW(module,
            MAKEINTRESOURCEW(mode == Mode::Dark ? 202 : 201), IMAGE_BITMAP,
            dimensions.bmWidth, dimensions.bmHeight, LR_CREATEDIBSECTION));
        if (replacement) {
            auto previous = reinterpret_cast<HBITMAP>(SendMessageW(window, STM_SETIMAGE,
                IMAGE_BITMAP, reinterpret_cast<LPARAM>(replacement)));
            if (!state->capturedHeader) {
                state->originalHeader = previous;
                state->capturedHeader = true;
            }
            if (state->themedHeader) DeleteObject(state->themedHeader);
            state->themedHeader = replacement;
        }
    }
}

BOOL CALLBACK Attach(HWND window, LPARAM force) {
    DWORD_PTR data = 0;
    if (!GetWindowSubclass(window, Subclass, subclassId, &data)) {
        auto* state = new (std::nothrow) ControlState;
        if (!state) return TRUE;
        if (!SetWindowSubclass(window, Subclass, subclassId, reinterpret_cast<DWORD_PTR>(state))) {
            delete state;
            return TRUE;
        }
        StyleControl(window, state);
    } else if (force) {
        StyleControl(window, reinterpret_cast<ControlState*>(data));
    }
    return TRUE;
}

void Refresh(Mode next) {
    if (refreshing || !mainWindow) return;
    refreshing = true;
    mode = next;
    auto oldBrush = backgroundBrush;
    backgroundBrush = CreateSolidBrush(Background());
    const BOOL dark = mode == Mode::Dark;
    // Unsupported DWM attributes simply fail; the content still follows the theme.
    DwmSetWindowAttribute(mainWindow, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &dark, sizeof(dark));
    Attach(mainWindow, TRUE);
    EnumChildWindows(mainWindow, Attach, TRUE);
    RedrawWindow(mainWindow, nullptr, nullptr, RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_FRAME);
    if (oldBrush) DeleteObject(oldBrush);
    refreshing = false;
}

LRESULT DrawButton(NMCUSTOMDRAW* draw) {
    if (draw->dwDrawStage != CDDS_PREPAINT) return CDRF_DODEFAULT;
    HWND button = draw->hdr.hwndFrom;
    const auto type = GetWindowLongPtrW(button, GWL_STYLE) & BS_TYPEMASK;
    const bool check = type == BS_AUTOCHECKBOX || type == BS_CHECKBOX || type == BS_AUTO3STATE || type == BS_3STATE;
    const bool radio = type == BS_AUTORADIOBUTTON || type == BS_RADIOBUTTON;
    const bool push = type == BS_PUSHBUTTON || type == BS_DEFPUSHBUTTON;
    if (!check && !radio && !push) return CDRF_DODEFAULT;

    const int saved = SaveDC(draw->hdc);
    RECT bounds = draw->rc, textBounds = bounds;
    const bool disabled = !IsWindowEnabled(button);
    const bool pressed = (draw->uItemState & CDIS_SELECTED) != 0;
    const bool hot = (draw->uItemState & CDIS_HOT) != 0;
    const bool focused = GetFocus() == button;
    const int dpi = GetDeviceCaps(draw->hdc, LOGPIXELSX);
    const int gap = MulDiv(5, dpi, 96);
    const COLORREF border = focused || type == BS_DEFPUSHBUTTON ? accent : RGB(100, 111, 107);
    HBRUSH face = CreateSolidBrush(push ? (pressed ? RGB(44, 70, 84) : hot ? RGB(62, 72, 68) : RGB(44, 51, 48)) : darkBackground);
    FillRect(draw->hdc, &bounds, face);
    DeleteObject(face);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    SelectObject(draw->hdc, pen);
    SelectObject(draw->hdc, GetStockObject(HOLLOW_BRUSH));
    if (push) {
        RoundRect(draw->hdc, bounds.left, bounds.top, bounds.right, bounds.bottom, gap, gap);
        InflateRect(&textBounds, -gap, -2);
        DWORD_PTR data = 0;
        if (GetWindowSubclass(button, Subclass, subclassId, &data) && reinterpret_cast<ControlState*>(data)->shield) {
            SHSTOCKICONINFO icon{sizeof(icon)};
            if (SUCCEEDED(SHGetStockIconInfo(SIID_SHIELD, SHGSI_ICON | SHGSI_SMALLICON, &icon))) {
                const int size = MulDiv(16, dpi, 96);
                DrawIconEx(draw->hdc, textBounds.left, (bounds.bottom - size) / 2,
                    icon.hIcon, size, size, 0, nullptr, DI_NORMAL);
                DestroyIcon(icon.hIcon);
                textBounds.left += size + gap;
            }
        }
    } else {
        const int size = MulDiv(13, dpi, 96);
        RECT box{bounds.left, bounds.top + (bounds.bottom - bounds.top - size) / 2, bounds.left + size, 0};
        box.bottom = box.top + size;
        if (radio) Ellipse(draw->hdc, box.left, box.top, box.right, box.bottom);
        else Rectangle(draw->hdc, box.left, box.top, box.right, box.bottom);
        const auto selected = SendMessageW(button, BM_GETCHECK, 0, 0);
        if (selected != BST_UNCHECKED) {
            HBRUSH mark = CreateSolidBrush(disabled ? RGB(125, 133, 129) : accent);
            InflateRect(&box, -3, -3);
            if (radio) {
                auto previous = SelectObject(draw->hdc, mark);
                Ellipse(draw->hdc, box.left, box.top, box.right, box.bottom);
                SelectObject(draw->hdc, previous);
            } else if (selected == BST_INDETERMINATE) {
                FillRect(draw->hdc, &box, mark);
            } else {
                HPEN tick = CreatePen(PS_SOLID, 2, accent);
                auto previous = SelectObject(draw->hdc, tick);
                MoveToEx(draw->hdc, box.left, (box.top + box.bottom) / 2, nullptr);
                LineTo(draw->hdc, (box.left + box.right) / 2, box.bottom);
                LineTo(draw->hdc, box.right, box.top);
                SelectObject(draw->hdc, previous);
                DeleteObject(tick);
            }
            DeleteObject(mark);
        }
        textBounds.left += size + gap;
    }
    wchar_t text[1024]{};
    GetWindowTextW(button, text, 1024);
    SelectObject(draw->hdc, reinterpret_cast<HFONT>(SendMessageW(button, WM_GETFONT, 0, 0)));
    SetBkMode(draw->hdc, TRANSPARENT);
    SetTextColor(draw->hdc, disabled ? RGB(150, 158, 154) : darkText);
    UINT flags = DT_VCENTER | DT_SINGLELINE | (push ? DT_CENTER : DT_LEFT);
    const auto uiState = SendMessageW(button, WM_QUERYUISTATE, 0, 0);
    if (uiState & UISF_HIDEACCEL) flags |= DT_HIDEPREFIX;
    DrawTextW(draw->hdc, text, -1, &textBounds, flags);
    if (focused && !(uiState & UISF_HIDEFOCUS)) {
        InflateRect(&bounds, -3, -3);
        DrawFocusRect(draw->hdc, &bounds);
    }
    RestoreDC(draw->hdc, saved);
    DeleteObject(pen);
    return CDRF_SKIPDEFAULT;
}

LRESULT CALLBACK Subclass(HWND window, UINT message, WPARAM wParam, LPARAM lParam, UINT_PTR, DWORD_PTR data) {
    auto* state = reinterpret_cast<ControlState*>(data);
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, Subclass, subclassId);
        if (state->themedHeader) {
            SendMessageW(window, STM_SETIMAGE, IMAGE_BITMAP, reinterpret_cast<LPARAM>(state->originalHeader));
            DeleteObject(state->themedHeader);
        }
        delete state;
        if (window == mainWindow) {
            if (hook) UnhookWindowsHookEx(hook);
            hook = nullptr;
            mainWindow = nullptr;
            if (backgroundBrush) DeleteObject(backgroundBrush);
            backgroundBrush = nullptr;
        }
        return DefSubclassProc(window, message, wParam, lParam);
    }
    if (message == BCM_SETSHIELD) state->shield = lParam != 0;
    if (window == mainWindow) {
        if (message == WM_SETTINGCHANGE || message == WM_THEMECHANGED || message == WM_SYSCOLORCHANGE) {
            if (!refreshing) PostMessageW(window, refreshMessage, 0, 0);
        } else if (message == refreshMessage) {
            Refresh(ReadMode());
            return 0;
        }
    }
    // Explicitly handle high-contrast colors too: MUI otherwise forces white panels.
    if (mode != Mode::Light) {
        if (message >= WM_CTLCOLORMSGBOX && message <= WM_CTLCOLORSTATIC) {
            HDC dc = reinterpret_cast<HDC>(wParam);
            SetTextColor(dc, IsWindowEnabled(reinterpret_cast<HWND>(lParam)) ? Text() : GetSysColor(COLOR_GRAYTEXT));
            SetBkColor(dc, Background());
            return reinterpret_cast<LRESULT>(backgroundBrush);
        }
        if (message == WM_ERASEBKGND && (window == mainWindow || IsClass(window, L"#32770"))) {
            RECT rect{};
            GetClientRect(window, &rect);
            FillRect(reinterpret_cast<HDC>(wParam), &rect, backgroundBrush);
            return 1;
        }
        if (mode == Mode::Dark && message == WM_NOTIFY) {
            auto* notification = reinterpret_cast<NMHDR*>(lParam);
            if (notification && notification->code == NM_CUSTOMDRAW && IsClass(notification->hwndFrom, L"Button")) {
                return DrawButton(reinterpret_cast<NMCUSTOMDRAW*>(lParam));
            }
        }
    }
    return DefSubclassProc(window, message, wParam, lParam);
}

LRESULT CALLBACK ObservePages(int code, WPARAM wParam, LPARAM lParam) {
    if (code >= 0 && mainWindow && !refreshing) {
        const auto* event = reinterpret_cast<CWPSTRUCT*>(lParam);
        // Every MUI/nsDialogs page is initialized before it is shown. Attach here
        // so pages created after .onGUIInit have their colors before first paint.
        if (event->message == WM_SHOWWINDOW && event->wParam &&
            (event->hwnd == mainWindow || IsChild(mainWindow, event->hwnd))) {
            Attach(event->hwnd, FALSE);
            EnumChildWindows(event->hwnd, Attach, FALSE);
        }
    }
    return CallNextHookEx(hook, code, wParam, lParam);
}
} // namespace

// NSIS Unicode plugin ABI. No stack arguments or dependency on its private structs.
extern "C" __declspec(dllexport) void __cdecl Init(HWND parent, int, wchar_t*, void*, void*) {
    if (mainWindow || !parent) return;
    // Window callbacks must remain valid until process exit, including abort paths.
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&Init), &module);
    mainWindow = parent;
    Refresh(ReadMode());
    hook = SetWindowsHookExW(WH_CALLWNDPROC, ObservePages, nullptr, GetCurrentThreadId());
}
