# PDF diff fixtures

Small, public reference pairs for exercising visual and text comparison. The
files are kept in category folders so they can be dropped into the app as
before/after documents.

| Category                   | Before                                                          | After                                                           | What to look for                                                                                            |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CAD drawing                | [`wheel-hub-rev-a.pdf`](cad/wheel-hub-rev-a.pdf)                | [`wheel-hub-rev-b.pdf`](cad/wheel-hub-rev-b.pdf)                | The wheel hub changes to support a splined motor shaft; Rev B adds the stepped bore and counterbore.        |
| PCB schematic              | [`olimexino-stm32-rev-a.pdf`](pcb/olimexino-stm32-rev-a.pdf)    | [`olimexino-stm32-rev-b.pdf`](pcb/olimexino-stm32-rev-b.pdf)    | Official OLIMEXINO-STM32 board schematic revisions.                                                         |
| Contract                   | [`work-order-original.pdf`](contracts/work-order-original.pdf)  | [`work-order-amended.pdf`](contracts/work-order-amended.pdf)    | Minnesota’s sample work order versus Amendment 1, including term, payment, exhibit, and attachment changes. |
| Datasheet - shift register | [`ti-sn74hc595-rev-i.pdf`](datasheets/ti-sn74hc595-rev-i.pdf)   | [`ti-sn74hc595-rev-j.pdf`](datasheets/ti-sn74hc595-rev-j.pdf)   | TI SN54HC595/SN74HC595 revision pair with document-structure and specification-history changes.             |
| Datasheet - bus buffer     | [`ti-sn74lv126a-rev-i.pdf`](datasheets/ti-sn74lv126a-rev-i.pdf) | [`ti-sn74lv126a-rev-j.pdf`](datasheets/ti-sn74lv126a-rev-j.pdf) | TI SN54LV126A/SN74LV126A revision pair with formatting, package, and documentation updates.                 |

## Provenance

Downloaded on 2026-08-28 over HTTPS.

- CAD source: [University of Florida Engineering Change Notice example](https://web.mae.ufl.edu/designlab/Lab%20Assignments/EML2322L-Engineering%20Change%20Notice.pdf), pages 3 and 4. The extracted pages are the original and changed wheel-hub drawings.
- PCB source: [Olimex OLIMEXINO-STM32 page](https://www.olimex.com/wiki/Olimexino-STM32), using its linked [Rev A schematic](https://www.olimex.com/Products/Duino/STM32/OLIMEXINO-STM32/resources/OLIMEXINO-STM32_Rev.A-schematic.pdf) and [Rev B schematic](https://www.olimex.com/Products/Duino/STM32/OLIMEXINO-STM32/resources/OLIMEXINO-STM32_Rev_B.pdf).
- Contract source: [Minnesota Department of Commerce MC-LEEP sample](https://mn.gov/commerce-stat/pdfs/leep-master-contract-sample.pdf), pages 10 and 15. The extracted pages are Exhibit A’s sample work order and Exhibit B’s sample amended work order.
- Datasheet source: TI’s [SN74HC595 Rev J](https://www.ti.com/lit/ds/symlink/sn74hc595.pdf) and [SN74LV126A Rev J](https://www.ti.com/lit/ds/symlink/sn74lv126a.pdf). The archived Rev I copies are [SCLS041I](https://static.elitesecurity.org/uploads/4/0/4002238/scls041i.pdf) and [SCES131I](https://docs.rs-online.com/2f33/A700000006908743.pdf), respectively; both carry the matching TI document number and revision on their first page.

The original multi-page downloads are retained in [`sources/`](sources/)
solely to make the extracted-page provenance explicit. These are reference
fixtures, not legal, manufacturing, or engineering advice.

## Safety and integrity checks

- Only HTTPS PDF URLs were downloaded; archives, executables, and office files were not fetched.
- Every final fixture parses in the app’s existing PDF.js runtime; extracted fixtures are one page and datasheets retain their original multi-page structure.
- Each downloaded file is below the app’s 150 MB input limit.
- No `/JavaScript`, `/EmbeddedFiles`, `/Launch`, or `/RichMedia` markers were found. The OLIMEX files contain ordinary `/OpenAction` page-position entries.

SHA-256:

```text
f44658f599235fd626af8f5a274b52006d58f1aa3b6202fc2cb00d115082f4b2  cad/wheel-hub-rev-a.pdf
9d19f63ea9714696c8390608afc2043ebe496c224c0f1643cf59913f643624d5  cad/wheel-hub-rev-b.pdf
97b17b1304bbc03a68bd41545f73dd33329b31280762d2a12f2cbd86a7300182  contracts/work-order-original.pdf
e93cbf5cab5ea8e20f03d8837d3f1f7baa1d675fed1a9b725533c4dc2605c599  contracts/work-order-amended.pdf
169dbb73af165d3f21d041fba1f3745e7ea8102ebcb6076322d2d1f4b1881a18  pcb/olimexino-stm32-rev-a.pdf
301e53f31e5ecf5a575b63c8f8fc3a13943e4ab0e33bfc27558d1cec89177572  pcb/olimexino-stm32-rev-b.pdf
a23cd0d0eef5d84e787d7bb4133955d65ffb753b7161567d151157aacf5b3971  sources/mn-leep-master-contract-sample.pdf
bbe9020e42ce6b96dc1b8284193141cb34a55195e5526f21f2fc8d9fd01967b0  sources/ufl-engineering-change-notice.pdf
e29fd26610abff77d168017b6cdb5fca47a5493deee8a0df94666946ae6540e3  datasheets/ti-sn74hc595-rev-i.pdf
215816945704e56196dea7c2c2b3b2a754e9abcea8efb23abbe052889e35afe4  datasheets/ti-sn74hc595-rev-j.pdf
7c12ac79e91ee70c10d4e04eb38de708f51362db92d9a940d7751e5193749dbb  datasheets/ti-sn74lv126a-rev-i.pdf
204663db429773abe5f55a0418f4ac6cfef700383ba8df48ac16ba7cbe74038c  datasheets/ti-sn74lv126a-rev-j.pdf
```
