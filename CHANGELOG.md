# Changelog

Every release is a tag `vX.Y.Z` with a section `## [X.Y.Z]` here; the release on GitHub gets that section as its notes
and `footer.tmpl` as its download. The version is also at the top of `footer.tmpl`.

## [1.2.0] - 2026-11-16

### Added
- Alt-click (Option-click on a Mac) on a status in the *Status* dropdown excludes it, like in Gitea's own Label filter:
  the list shows everything except that status. Several statuses can be excluded, and Alt-click on an excluded status
  brings it back. The exclusion is kept in the URL (`#status=-Done`).

## [1.1.2] - 2026-11-05

### Fixed
- Long issue lists no longer make Gitea slow, which was most noticeable in Safari. The items of the other pages used to
  be added to the page as hidden rows right away; with many pages that meant hundreds of extra rows for the browser and
  its extensions to go through. They now stay out of the page until a *Status* filter needs them.

### Changed
- The end-to-end test (`test/test.sh`) now runs in WebKit, the engine of Safari, as well as in Chromium.

## [1.1.1] - 2026-10-28

### Fixed
- The badge now has the same height, vertical position and spacing as Gitea's own labels next to it. It sat 2.5px
  lower and touched the first label. It is now built like a Gitea label: a link with class `item` around a `ui label`.
- With more than one board, the badges are in board order.

## [1.1.0] - 2026-10-27

### Added
- Organisation (and user) project boards, under `/{owner}/-/projects`. They are read next to the repository's own
  boards, so their columns show up as badges and in the *Status* filter
  ([#1](https://github.com/Vandewaetere/gitea-board-badges/issues/1)).
- The version number at the top of `footer.tmpl`.

### Changed
- Cards are matched on repository and issue number. An organisation board can hold issues of several repositories, so
  `other-repo#5` no longer gives a badge to `this-repo#5`.

## [1.0.0] - 2026-10-23

First release.

- Badges with the board column of every issue and pull request in Gitea's issue lists, in the column's colour.
- A *Status* dropdown in the filter bar that filters the whole list, across all pages, including *No board*.
- Works on repository lists and on the global `/issues` overview; texts in English and Dutch.
