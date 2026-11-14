// Native regression tests use hidden test windows only. No registry writes,
// installation, user theme changes, or interaction with the running application.
#pragma comment(linker, "/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='x86' publicKeyToken='6595b64144ccf1df' language='*'\"")
#include "theme.cpp"
#include <cstdio>
#include <cstdlib>

void Check(bool condition, const char* message) {
    if (!condition) {
        std::fprintf(stderr, "FAIL: %s\n", message);
        std::exit(1);
    }
}

int main() {
    Check(ChooseMode(true, 0, false) == Mode::Dark, "Windows app dark preference");
    Check(ChooseMode(true, 1, false) == Mode::Light, "Windows app light preference");
    Check(ChooseMode(false, 0, false) == Mode::Light, "missing preference falls back to light");
    Check(ChooseMode(true, 0, true) == Mode::Contrast, "high contrast overrides dark");
    Check(ChooseMode(true, 1, true) == Mode::Contrast, "high contrast overrides light");

    INITCOMMONCONTROLSEX common{sizeof(common), ICC_STANDARD_CLASSES | ICC_PROGRESS_CLASS | ICC_LISTVIEW_CLASSES};
    InitCommonControlsEx(&common);
    HMODULE richEdit = LoadLibraryW(L"Msftedit.dll");
    HWND parent = CreateWindowExW(0, L"#32770", L"Hidden installer theme test", WS_OVERLAPPED,
        0, 0, 500, 400, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    Check(parent != nullptr, "create hidden wizard fixture");
    HWND header = CreateWindowW(L"Static", L"", WS_CHILD | SS_BITMAP, 0, 0, 150, 57,
        parent, reinterpret_cast<HMENU>(1046), nullptr, nullptr);
    HWND license = CreateWindowW(L"RICHEDIT50W", L"MIT License - Nikolas Haefner", WS_CHILD | ES_MULTILINE,
        0, 60, 300, 200, parent, nullptr, nullptr, nullptr);
    HWND next = CreateWindowW(L"Button", L"Weiter >", WS_CHILD | BS_DEFPUSHBUTTON,
        0, 300, 90, 30, parent, nullptr, nullptr, nullptr);
    HWND check = CreateWindowW(L"Button", L"VereinO starten", WS_CHILD | BS_AUTOCHECKBOX,
        100, 300, 150, 30, parent, nullptr, nullptr, nullptr);
    Check(header && license && next && check, "create wizard controls");
    Init(parent, 0, nullptr, nullptr, nullptr);
    Refresh(Mode::Dark);
    HDC dc = GetDC(parent);
    auto brush = reinterpret_cast<HBRUSH>(SendMessageW(parent, WM_CTLCOLORSTATIC,
        reinterpret_cast<WPARAM>(dc), reinterpret_cast<LPARAM>(license)));
    LOGBRUSH color{};
    GetObjectW(brush, sizeof(color), &color);
    Check(color.lbColor == darkBackground && GetTextColor(dc) == darkText, "dark dialog and text colors");
    CHARFORMAT2W format{};
    format.cbSize = sizeof(format);
    SendMessageW(license, EM_GETCHARFORMAT, SCF_DEFAULT, reinterpret_cast<LPARAM>(&format));
    Check(format.crTextColor == darkText, "license RichEdit text follows dark mode");
    Check(SendMessageW(header, STM_GETIMAGE, IMAGE_BITMAP, 0) != 0, "dark header bitmap loaded");

    SendMessageW(next, BCM_SETSHIELD, 0, TRUE);
    DWORD_PTR data = 0;
    Check(GetWindowSubclass(next, Subclass, subclassId, &data) && reinterpret_cast<ControlState*>(data)->shield,
        "elevation shield retained");
    HDC canvas = CreateCompatibleDC(dc);
    HBITMAP bitmap = CreateCompatibleBitmap(dc, 160, 32);
    auto previous = SelectObject(canvas, bitmap);
    NMCUSTOMDRAW draw{};
    draw.hdr.hwndFrom = next;
    draw.hdr.code = NM_CUSTOMDRAW;
    draw.dwDrawStage = CDDS_PREPAINT;
    draw.hdc = canvas;
    draw.rc = {0, 0, 90, 30};
    Check(SendMessageW(parent, WM_NOTIFY, 0, reinterpret_cast<LPARAM>(&draw)) == CDRF_SKIPDEFAULT,
        "button custom drawing reached through parent subclass");
    Check(GetPixel(canvas, 5, 5) == RGB(44, 51, 48), "dark button surface rendered");
    EnableWindow(next, FALSE);
    draw.uItemState = CDIS_DISABLED;
    Check(DrawButton(&draw) == CDRF_SKIPDEFAULT, "disabled button rendered");
    draw.hdr.hwndFrom = check;
    draw.rc.right = 150;
    SendMessageW(check, BM_SETCHECK, BST_CHECKED, 0);
    Check(DrawButton(&draw) == CDRF_SKIPDEFAULT, "checked finish-page checkbox rendered");
    SelectObject(canvas, previous);
    DeleteObject(bitmap);
    DeleteDC(canvas);

    HWND page = CreateWindowW(L"#32770", L"New page", WS_CHILD, 0, 0, 200, 200, parent, nullptr, nullptr, nullptr);
    HWND edit = CreateWindowW(L"Edit", L"C:\\VereinO", WS_CHILD, 0, 0, 150, 20, page, nullptr, nullptr, nullptr);
    SendMessageW(page, WM_SHOWWINDOW, TRUE, 0);
    Check(GetWindowSubclass(page, Subclass, subclassId, &data) && GetWindowSubclass(edit, Subclass, subclassId, &data),
        "later wizard pages and their controls receive theme before paint");
    const DWORD gdiBefore = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    for (int i = 0; i < 12; ++i) Refresh(i % 2 ? Mode::Dark : Mode::Light);
    Check(GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS) <= gdiBefore + 1,
        "repeated theme switches do not leak bitmap or brush handles");
    Refresh(Mode::Light);
    SendMessageW(license, EM_GETCHARFORMAT, SCF_DEFAULT, reinterpret_cast<LPARAM>(&format));
    Check(format.crTextColor == GetSysColor(COLOR_WINDOWTEXT), "license restores native light text");
    Check(SendMessageW(parent, WM_NOTIFY, 0, reinterpret_cast<LPARAM>(&draw)) != CDRF_SKIPDEFAULT,
        "light mode leaves native buttons in control");
    Refresh(Mode::Contrast);
    brush = reinterpret_cast<HBRUSH>(SendMessageW(parent, WM_CTLCOLOREDIT,
        reinterpret_cast<WPARAM>(dc), reinterpret_cast<LPARAM>(edit)));
    GetObjectW(brush, sizeof(color), &color);
    Check(color.lbColor == GetSysColor(COLOR_WINDOW), "high contrast uses Windows system colors");
    SendMessageW(parent, WM_SETTINGCHANGE, 0, 0);
    MSG event{};
    int messages = 0;
    while (PeekMessageW(&event, nullptr, 0, 0, PM_REMOVE)) {
        Check(++messages < 100, "theme refresh does not create a notification loop");
        TranslateMessage(&event);
        DispatchMessageW(&event);
    }
    Check(mode == ReadMode(), "live settings notification reloads the Windows app preference");
    ReleaseDC(parent, dc);
    DestroyWindow(parent);
    Check(!mainWindow && !hook && !backgroundBrush, "wizard teardown releases hooks and brushes");
    FreeLibrary(richEdit);
    std::puts("Installer theme: preference, contrast, controls, page changes, theme switches and teardown passed.");
}
