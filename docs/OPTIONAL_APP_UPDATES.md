# Optional ONE80 store updates

The Flutter session gate checks for a newer store release after the opening
animation. Members and guests can always continue: Later, Android Back, and
outside-tap dismiss the prompt. A displayed release is quiet for 24 hours;
a different newer release is eligible immediately. Checks and preference
failures never block entry. The prompt waits behind another route/dialog and
while the keyboard is open, and does not stack over the member photo flow.

Android uses Google Play's update-availability API and compares version codes.
The Update now button opens Google Play for the installed application ID.
iOS looks up the installed bundle ID in Apple's public catalog, compares the
numeric public version, checks minimum iOS compatibility, and opens the matching
Apple-provided App Store URL. Store lookup uses the device region (EG fallback);
a missing regional listing or failed lookup produces no prompt. The device region
can differ from the Apple account storefront, so storefront/device testing is
required before release.

## Shipping

1. Verify the existing Android application ID and iOS bundle ID match the actual
   ONE80 listings and signing identities. At implementation time the repository
   contains Android `com.alatheer.pharosclub` and iOS
   `com.alatheertech.Noamany`. They were intentionally not renamed, since changing
   an existing store identity would break the update path. Store ownership and
   listings have not been confirmed by this task.
2. Publish a release containing this feature through the normal store review
   flow. Already-installed older releases cannot display a newly added feature
   until users install that release.
3. Publish the next release with a higher Android versionCode and iOS marketing
   version. There is no backend release flag or manual fake-update notification.
4. Test with an actual store-installed build and an eligible newer store release.
   A sideloaded debug APK cannot establish Google Play update eligibility.

No forced update, automatic installation, sign-out, download link, or server
migration is introduced. Opening the store is not proof of installing an update.

## Validation and preview

- `flutter test --no-pub test/core/updates`
- `flutter analyze --no-pub lib/core/updates`
- `flutter run -t tool/optional_update_preview.dart` displays an explicitly
  labeled local preview with a simulated release. It never queries or opens a
  real listing. Its Update button intentionally demonstrates store-open failure.
  Production `lib/main.dart` does not reference this entry point.

References: [Google Play update testing](https://developer.android.com/guide/playcore/in-app-updates/test),
[Apple catalog lookup](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html).
