    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP
    NOP

    ; VBANK HERE
    LD A, 0
    RETI ; return from interrupt

; load address of vram
	LD H, 0x80
	LD L, 0x00

; set time for the plus
	LD A, 4
first_part:
    LD (HL), 0x08
    inc HL
    LD (HL), 0x80
    inc HL
    dec A
    JP NZ, first_part
    JP plus_end

	LD (HL), 0xff
    inc HL
    LD (HL), 0xff
    inc HL
    
    LD A, 3
    JP first_part

plus_end:
    LD H, 0x98
    LD L, 0x00
    LD (HL), 0 ; tile 0

    EI ; enable interrupts
    LD H, 0xff
    LD L, 0xff
    LD (HL), 1 ; listen for vblank interrupts

    LD H, 0xff
    LD L, 0x40
    LD (HL), 0x80 ; enable ppu

    ; wait for VBLANK
    LD A, 0
loop:
    CP 0
    LD (HL), 0x8000
    JP Z, loop
    halt

